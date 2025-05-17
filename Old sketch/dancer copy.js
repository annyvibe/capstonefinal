const TRACKED_POINTS = {
    leftHand: 15,
    rightHand: 16,
    leftFoot: 27,
    rightFoot: 28
};


let movePoints = []; // ***

let currentEmotion = "happy";
let currentEmotionColorPair;

let video;
let bodyPose;
let poses = [];
let currentTracking = "leftHand";

// states
let replaying = false;
let replayIndex = 0;
let videoExpanded = false;
let isPlaying = false;

// audio-related
let handAudio, feetAudio;
let handAmp, feetAmp;

let uiLayer;
let particles = [];

let burstFlashTimer = 0;
let burstFlashPos;


function preload() {
    bodyPose = ml5.bodyPose("BlazePose");
}

function setup() {
    createCanvas(windowWidth, windowHeight, WEBGL);
    const params = new URLSearchParams(window.location.search);
    const dancer = params.get("dancer") || "Dancer1";
    const emotion = params.get("emotion") || "happy";
    currentEmotion = emotion;
    currentDancer = dancer;
    currentEmotionColorPair = getVisualByEmotion(currentEmotion).colors;
    loadEmotionVideo(currentEmotion, currentDancer);
    bindUI();
    uiLayer = createGraphics(windowWidth, windowHeight);
    uiLayer.clear();
    colorMode(HSB, 255);
}
function bindUI() {
    const playBtn = document.getElementById("playButton");

    playBtn.addEventListener("click", () => {
        if (isPlaying) {
            video.pause();
            handAudio.pause();
            feetAudio.pause();
            playBtn.innerText = "Play";
        } else {
            video.play();
            if (currentTracking.includes("Hand")) {
                handAudio.play();
            } else {
                feetAudio.play();
            }
            playBtn.innerText = "Pause";
        }
        isPlaying = !isPlaying;
    });

    document.getElementById("replayButton").addEventListener("click", replayTrack);
    document.getElementById("expandButton").addEventListener("click", expandVideo);
    document.getElementById("shrinkButton").addEventListener("click", shrinkVideo);

    document.querySelectorAll(".emoBtn").forEach(btn => {
        btn.addEventListener("click", () => {
            loadEmotionVideo(btn.getAttribute("data-emotion"));
        });
    });

    document.querySelectorAll(".trackBtn").forEach(btn => {
        btn.addEventListener("click", () => {
            switchTracking(btn.getAttribute("data-track"));
        });
    });
}
function expandVideo() {
    let targetHeight = windowHeight;
    let targetWidth = targetHeight * 9 / 16;

    video.size(targetWidth, targetHeight);
    video.position((windowWidth - targetWidth) / 2, 0);

    videoExpanded = true;
    document.getElementById("expandButton").style.display = "none";
    document.getElementById("shrinkButton").style.display = "inline-block";
}

function shrinkVideo() {
    video.size(180, 320);
    video.position(10, 10);

    videoExpanded = false;

    document.getElementById("shrinkButton").style.display = "none";
    document.getElementById("expandButton").style.display = "inline-block";
}
function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    uiLayer.resizeCanvas(windowWidth, windowHeight);
    positionUI();
}
function loadEmotionVideo(emotion, dancer = "Dancer1") {
    currentEmotion = emotion;
    currentDancer = dancer;
    currentEmotionColorPair = getVisualByEmotion(emotion).colors;
    movePoints = [];

    if (handAudio) handAudio.stop();
    if (feetAudio) feetAudio.stop();

    if (video) {
        video.remove();
    }

    let base = `assets/${dancer}/${emotion}`;
    let videoPath = `assets/${dancer}/${emotion}.mp4`;
    let handAudioPath = `assets/${dancer}/hand_${emotion}.mp3`;
    let feetAudioPath = `assets/${dancer}/feet_${emotion}.mp3`;

    video = createVideo(videoPath, () => {
        console.log("Loaded video for", dancer, emotion);
    });

    video.size(180, 320);
    video.position(10, 10);
    video.volume(0);
    video.elt.onloadeddata = () => {
        video.pause();
    };
    video.elt.onplay = () => {
        startPoseDetection();
    };
    video.onended(() => {
        handAudio.pause();
        feetAudio.pause();
        isPlaying = false;
        playPauseButton.html("Play");
    });

    handAudio = loadSound(handAudioPath, () => {
        handAmp = new p5.Amplitude();
        handAmp.setInput(handAudio);
    });

    feetAudio = loadSound(feetAudioPath, () => {
        feetAmp = new p5.Amplitude();
        feetAmp.setInput(feetAudio);
    });
}
function drawSpikyBall(radius, detail = 20, distortion = 0.4) {
    for (let i = 0; i < detail; i++) {
        let theta1 = map(i, 0, detail, 0, PI);
        let theta2 = map(i + 1, 0, detail, 0, PI);

        beginShape(TRIANGLE_STRIP);
        for (let j = 0; j <= detail; j++) {
            let phi = map(j, 0, detail, 0, TWO_PI);

            let x1 = radius * sin(theta1) * cos(phi);
            let y1 = radius * sin(theta1) * sin(phi);
            let z1 = radius * cos(theta1);

            let x2 = radius * sin(theta2) * cos(phi);
            let y2 = radius * sin(theta2) * sin(phi);
            let z2 = radius * cos(theta2);

            let d1 = 1 + random(-distortion, distortion);
            let d2 = 1 + random(-distortion, distortion);

            vertex(x1 * d1, y1 * d1, z1 * d1);
            vertex(x2 * d2, y2 * d2, z2 * d2);
        }
        endShape();
    }
}

function draw() {
    if (!videoExpanded) {
        background(0);
        scale(height / 2);
        orbitControl();
        rotateY(millis() * 0.0002);
        rotateX(-PI / 6);
        if (movePoints.length > 3) {
            noFill();
            stroke(lerpColor(currentEmotionColorPair[0], currentEmotionColorPair[1], 0.5));
            strokeWeight(2);
            beginShape();
            for (let i = 0; i < movePoints.length; i++) {
                curveVertex(movePoints[i].pos.x, movePoints[i].pos.y, movePoints[i].pos.z);
            }
            endShape();
        }
        let amp = currentTracking.includes("Hand")
            ? (handAmp ? handAmp.getLevel() : 0)
            : (feetAmp ? feetAmp.getLevel() : 0);
        let ampDelta = amp - (window.prevAmp || 0);
        window.prevAmp = amp;
        if (!replaying && poses.length > 0) {
            let pose = poses[0];
            let index = TRACKED_POINTS[currentTracking];
            let keypoint = pose.keypoints3D[index];

            if (keypoint && keypoint.confidence > 0.5) {
                let newPos = createVector(keypoint.x, keypoint.y, keypoint.z);
                let amp = currentTracking.includes("Hand") ? handAmp.getLevel() : feetAmp.getLevel();

                if (movePoints.length === 0 || p5.Vector.dist(movePoints[movePoints.length - 1].pos, newPos) > 0.01) {
                    movePoints.push(new MovementPoint(newPos, millis(), amp));
                }
            }
        }
        if (ampDelta > 0.08 && movePoints.length > 0) {
            let burstOrigin = movePoints[movePoints.length - 1].pos;
            let emotionColors = currentEmotionColorPair;
            burstFlashTimer = millis();
            burstFlashPos = burstOrigin.copy();
            for (let i = 0; i < 40; i++) {
                let dir = p5.Vector.random3D().mult(random(1.5, 2.5));
                let burstColor = lerpColor(emotionColors[0], emotionColors[1], random());
                particles.push(new Particle3D(burstOrigin, dir, 0.01, burstColor, amp));
            }
        }
        let particleCount = floor(map(amp, 0, 0.3, 1, 20, true));
        let endIndex = replaying ? replayIndex : movePoints.length - 1;
        for (let i = 0; i < endIndex; i++) {
            let p1 = movePoints[i];
            let p2 = movePoints[i + 1];
            let dir = p5.Vector.sub(p2.pos, p1.pos).normalize();
            let speed = p1.speedTo(p2);
            let emotionColors = currentEmotionColorPair;

            for (let k = 0; k < particleCount; k++) {
                let t = random();
                let jitter = p5.Vector.random3D().mult(0.01);
                let spawnPos = p5.Vector.lerp(p1.pos, p2.pos, t).add(jitter);
                let lerpedColor = lerpColor(emotionColors[0], emotionColors[1], random(1));
                particles.push(new Particle3D(spawnPos, dir, speed * 0.5, lerpedColor, amp));
            }

            let avgAmp = (p1.amp + p2.amp) / 2;
            let thickness = map(avgAmp, 0, 1, 0.1, 300, true);
            stroke(lerpColor(emotionColors[0], emotionColors[1], 0.5));
            strokeWeight(thickness);
            line(p1.pos.x, p1.pos.y, p1.pos.z, p2.pos.x, p2.pos.y, p2.pos.z);

            p1.drawLine(p2);
            p1.drawEmotionShape();
        }

        if (replaying) {
            replayIndex++;
            if (replayIndex >= movePoints.length - 1) {
                replaying = false;
            }
        }
    }

    let vol = 0;
    if (currentTracking.includes("Hand") && handAmp) {
        vol = handAmp.getLevel();
    } else if (feetAmp) {
        vol = feetAmp.getLevel();
    }

    let speed = 0;
    if (movePoints.length >= 2) {
        speed = movePoints[movePoints.length - 2].speedTo(movePoints[movePoints.length - 1]);
    }

    let volumePct = map(vol, 0, 0.3, 0, 100, true);
    let speedPct = map(speed, 0, 0.003, 0, 100, true);

    let volumeEl = document.getElementById("volumeFill");
    let speedEl = document.getElementById("speedFill");

    if (volumeEl) volumeEl.style.width = volumePct + "%";
    if (speedEl) speedEl.style.width = speedPct + "%";
    for (let i = particles.length - 1; i >= 0; i--) {
        let pt = particles[i];
        pt.update();
        pt.display();
        if (pt.isDead()) {
            particles.splice(i, 1);
        }
    }
}

function drawVolumeAndSpeedBar() {
    uiLayer.clear();

    let volume = currentTracking.includes("Hand") ? handAmp?.getLevel() || 0 : feetAmp?.getLevel() || 0;
    let speed = 0;
    if (movePoints.length >= 2) {
        let pt1 = movePoints[movePoints.length - 2];
        let pt2 = movePoints[movePoints.length - 1];
        speed = pt1.speedTo(pt2);
    }

    let volumeWidth = map(volume, 0, 0.3, 0, 180, true);
    let speedWidth = map(speed, 0, 0.003, 0, 180, true);

    uiLayer.push();
    uiLayer.noStroke();
    uiLayer.textSize(12);
    uiLayer.fill(255);

    // Volume Label
    uiLayer.text("VOLUME", uiLayer.width - 220, 30);
    uiLayer.fill(80);
    uiLayer.rect(uiLayer.width - 220, 40, 180, 10, 5);
    uiLayer.fill(0, 255, 180);
    uiLayer.rect(uiLayer.width - 220, 40, volumeWidth, 10, 5);

    // Speed Label
    uiLayer.fill(255);
    uiLayer.text("SPEED", uiLayer.width - 220, 70);
    uiLayer.fill(80);
    uiLayer.rect(uiLayer.width - 220, 80, 180, 10, 5);
    uiLayer.fill(255, 80, 200);
    uiLayer.rect(uiLayer.width - 220, 80, speedWidth, 10, 5);

    uiLayer.pop();
}
class MovementPoint {
    constructor(pos, time, amp) {
        this.pos = pos;
        this.time = time;
        this.amp = amp;
        //
        this.addtionalPos = createVector(random(-0.01, 0.01), random(-0.01, 0.01), random(-0.01, 0.01))
        this.shouldDrawShape = (random(1) < 0.3);
        this.hue = map(this.amp, 0, 1, 0, 255);
        this.pSystem = new ParticleSystem(this.pos, currentEmotionColorPair);
    }
    speedTo(other) {
        let d = p5.Vector.dist(this.pos, other.pos);
        let t = (other.time - this.time) || 1;
        return d / t;
    }
    avgAmpWith(other) {
        return (this.amp + other.amp) / 2;
    }
    drawLine(other) {

        this.pSystem.origin = this.pos;
        this.pSystem.hue = map(this.amp, 0, 1, 0, 255);
        this.pSystem.addParticle();
        this.pSystem.run();


        other.pSystem.origin = other.pos;
        other.pSystem.hue = map(other.amp, 0, 1, 0, 255);
        other.pSystem.addParticle();
        other.pSystem.run();
    }
    drawEmotionShape() {
        if (!this.shouldDrawShape) return;
        const style = getVisualByEmotion(currentEmotion);

        let baseSize = map(pow(this.amp, 4), 0, 1.0, 0.05, 1.0, true);
        let strokeW = map(pow(this.amp, 4), 0, 1.0, 0.2, 200, true);


        let t = sin(millis() * 0.001);
        let lerpAmt = map(t, -1, 1, 0, 1);
        let c = lerpColor(style.colors[0], style.colors[1], lerpAmt);

        push();
        translate(this.pos.x + this.addtionalPos.x,
            this.pos.y + this.addtionalPos.y,
            this.pos.z + this.addtionalPos.z);

        fill(c);
        stroke(c);
        strokeWeight(strokeW);

        switch (style.shape) {
            case "circle":  // happy
                sphere(baseSize * 0.5);
                break;
            case "oval":  // sad
                push();
                scale(1.4, 0.6, 1.4);
                sphere(baseSize * 0.45);
                pop();
                break;
            case "parallelogram":  // peaceful
                box(baseSize * 1.4, baseSize * 0.8, baseSize * 0.4);
                break;
            case "spikyball":  // angry
                push();
                noStroke();
                drawSpikyBall(baseSize * 0.6, 20, 0.5);
                pop();
                break;
            case "triangleDown":  // fear
                rotateX(-PI / 2);
                cone(baseSize * 0.6, baseSize * 1.2);
                break;
        }

        pop();
    }
}

function smoothTrail(points, smoothingRange) {
    let smoothedPoints = [];
    for (let i = 0; i < points.length; i++) {
        let sum = createVector(0, 0, 0);
        let ampSum = 0;
        let count = 0;
        for (let j = max(0, i - smoothingRange); j <= min(points.length - 1, i + smoothingRange); j++) {
            sum.add(points[j].pos);
            ampSum += points[j].amp || 0;
            count++;
        }
        let avgPos = p5.Vector.div(sum, count);
        let avgAmp = ampSum / count;
        let time = points[i].time;
        smoothedPoints.push(new MovementPoint(avgPos, time, avgAmp));
    }
    return smoothedPoints;
}

///// UTILS /////

function startPoseDetection() {
    bodyPose.detectStart(video, gotPoses);
}

function gotPoses(results) {
    poses = results;
}

function replayTrack() {
    replaying = true;
    replayIndex = 0;
}

function switchTracking(part) {
    currentTracking = part;
    movePoints = [];

    video.time(0);
    video.pause();
    isPlaying = false;
    playPauseButton.html("Play");

    handAudio.pause();
    feetAudio.pause();
    if (part.includes("Hand")) {
        handAudio.jump(0);
    } else {
        feetAudio.jump(0);
    }
}

function togglePlayPause() {
    if (isPlaying) {
        video.pause();
        handAudio.pause();
        feetAudio.pause();
        playPauseButton.html("Play");
    } else {
        video.play();
        if (currentTracking.includes("Hand")) {
            handAudio.play();
        } else {
            feetAudio.play();
        }
        playPauseButton.html("Pause");
    }
    isPlaying = !isPlaying;
}

function updateVideoTime() {
    let newTime = progressSlider.value() * video.duration();
    video.time(newTime);
    pointss = [];
    if (currentTracking.includes("Hand")) {
        handAudio.jump(newTime);
    } else {
        feetAudio.jump(newTime);
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function getVisualByEmotion(emotion) {
    colorMode(RGB);
    const styles = {
        happy: {
            colors: [color(255, 200, 50), color(255, 255, 150)], shape: "circle"
        }, // bright warm yellow-orange
        sad: {
            colors: [color(50, 100, 200), color(120, 180, 255)], shape: "oval"
        }, // deep to sky blue
        peaceful: {
            colors: [color(180, 230, 220), color(220, 255, 250)], shape: "parallelogram"
        }, // pastel mint to cyan
        angry: {
            colors: [color(220, 0, 0), color(255, 80, 60)], shape: "spikyball"
        }, // true red to hot orange-red
        fear: {
            colors: [color(90, 60, 110), color(160, 100, 180)], shape: "triangleDown"
        } // purple-gray to eerie violet
    };
    colorMode(HSB, 255);
    return styles[emotion];
}
class Particle {
    constructor(pos, c) {
        this.pos = pos.copy();
        this.vel = p5.Vector.random3D().mult(random(0.0005, 0.002));
        this.acc = createVector(0, 0, 0);
        this.life = 255;
        this.color = c;
    }

    update() {
        this.vel.add(this.acc);
        this.pos.add(this.vel);
        this.life -= 2;
    }

    isDead() {
        return this.life <= 0;
    }

    display() {
        push();
        translate(this.pos.x, this.pos.y, this.pos.z);
        noStroke();

        colorMode(RGB);
        let faded = color(
            red(this.color),
            green(this.color),
            blue(this.color),
            this.life
        );
        fill(faded);
        sphere(0.003);
        pop();
    }
}

class ParticleSystem {
    constructor(origin, emotionColors) {
        this.origin = origin.copy();
        this.emotionColors = emotionColors;
        this.particles = [];
    }

    addParticle() {
        let c = lerpColor(this.emotionColors[0], this.emotionColors[1], random());
        this.particles.push(new Particle(this.origin, c));
    }

    run() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.update();
            p.display();
            if (p.isDead()) {
                this.particles.splice(i, 1);
            }
        }
    }
}
class Particle3D {
    constructor(pos, dir, speed, c, amp = 0.1) {
        this.pos = pos.copy();
        this.life = 255;
        this.color = c;

        const behavior = getParticleBehaviorByEmotion(currentEmotion);

        this.vel = p5.Vector.mult(dir, speed * behavior.speedMultiplier)
            .add(p5.Vector.random3D().mult(behavior.jitter));

        this.size = map(amp, 0, 1, 0.001, 0.012, true);
    }

    update() {
        this.pos.add(this.vel);
        this.life -= 6;
    }

    isDead() {
        return this.life <= 0;
    }

    display() {
        push();
        translate(this.pos.x, this.pos.y, this.pos.z);
        noStroke();

        colorMode(RGB);
        let faded = color(
            red(this.color),
            green(this.color),
            blue(this.color),
            map(this.life, 0, 255, 0, 255)
        );
        fill(faded);
        sphere(this.size);
        pop();
    }
}
function getParticleBehaviorByEmotion(emotion) {
    switch (emotion) {
        case "happy":
            return { speedMultiplier: 1.2, jitter: 0.005 };
        case "angry":
            return { speedMultiplier: 1.4, jitter: 0.006 };
        case "sad":
            return { speedMultiplier: 0.5, jitter: 0.001 };
        case "peaceful":
            return { speedMultiplier: 0.4, jitter: 0.0008 };
        case "fear":
            return { speedMultiplier: 1.0, jitter: 0.004 };
        default:
            return { speedMultiplier: 1.0, jitter: 0.002 };
    }
}