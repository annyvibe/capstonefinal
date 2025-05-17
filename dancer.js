const TRACKED_POINTS = {
    leftHand: 15,
    rightHand: 16,
    leftFoot: 27,
    rightFoot: 28
};

const PARTS = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'];

const TENSION_PAIRS = [
    ['leftHand', 'rightHand'],
    ['leftHand', 'leftFoot'],
    ['rightHand', 'rightFoot'],
    ['leftFoot', 'rightFoot']
];

let movePointsMap = new Map();
PARTS.forEach(p => movePointsMap.set(p, []));

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
let wholeBodyAudio, wholeBodyAmp;

let uiLayer;
let particles = [];

let burstFlashTimer = 0;
let burstFlashPos;

let replayFrameCounter = 0;
let prevAmp = 0;

let trackingTimeout;
const trackingDisplay = document.getElementById('trackingDisplay');

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

    clearTimeout(trackingTimeout);
    trackingDisplay.innerText = `Current tracking: ${currentTracking}`;
    trackingDisplay.style.opacity = '1';
    trackingTimeout = setTimeout(() => {
        trackingDisplay.style.opacity = '0';
    }, 2000);
}
function bindUI() {
    const playBtn = document.getElementById("playButton");


    playBtn.addEventListener("click", () => {
        if (isPlaying) {
            video.pause();
            handAudio?.pause();
            feetAudio?.pause();
            wholeBodyAudio?.pause();
            playBtn.innerText = "Play";

            noLoop();
        } else {
            video.play();
            if (currentTracking === "wholeBody") wholeBodyAudio?.play();
            else if (currentTracking.includes("Hand")) handAudio.play();
            else feetAudio.play();
            playBtn.innerText = "Pause";

            loop();
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
    let wholeBodyAudioPath = `assets/${dancer}/${emotion}.MP3`;

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
    wholeBodyAudio = loadSound(wholeBodyAudioPath, () => {
        wholeBodyAmp = new p5.Amplitude();
        wholeBodyAmp.setInput(wholeBodyAudio);
    });
}

function draw() {
    if (!videoExpanded) {
        background(0);
        scale(height / 2);
        orbitControl();
        // rotateY(millis() * 0.0002);
        // rotateX(-PI / 6);

        let ampVal;
        if (currentTracking === 'wholeBody') {
            ampVal = wholeBodyAmp ? wholeBodyAmp.getLevel() : 0;
        } else if (currentTracking.includes('Hand')) {
            ampVal = handAmp ? handAmp.getLevel() : 0;
        } else {
            ampVal = feetAmp ? feetAmp.getLevel() : 0;
        }

        const ampDelta = ampVal - prevAmp;
        prevAmp = ampVal;

        if (currentTracking === 'wholeBody') {
            amp = wholeBodyAmp ? wholeBodyAmp.getLevel() : 0;
        } else {
            amp = currentTracking.includes("Hand")
                ? (handAmp ? handAmp.getLevel() : 0)
                : (feetAmp ? feetAmp.getLevel() : 0);
        }


        //  Whole Body 
        if (poses.length > 0 && currentTracking === 'wholeBody') {
            const cols = currentEmotionColorPair;
            if (replaying) {

                PARTS.forEach(part => {
                    const arr = movePointsMap.get(part);
                    for (let i = 0; i < replayIndex && i < arr.length - 1; i++) {
                        arr[i].drawLine(arr[i + 1]);
                        arr[i].drawEmotionShape();
                    }
                });
            } else {

                const pose = poses[0];
                PARTS.forEach(part => {
                    const idx = TRACKED_POINTS[part];
                    const kp = pose.keypoints3D[idx];
                    if (kp && kp.confidence > 0.5) {
                        const arr = movePointsMap.get(part);
                        const v = createVector(kp.x, kp.y, kp.z);
                        if (arr.length === 0 || p5.Vector.dist(arr[arr.length - 1].pos, v) > 0.01) {
                            arr.push(new MovementPoint(v, millis(), amp));
                            if (arr.length > 80) arr.shift();
                        }
                    }
                });

                PARTS.forEach(part => {
                    const arr = movePointsMap.get(part);
                    for (let i = 0; i < arr.length - 1; i++) {
                        arr[i].drawLine(arr[i + 1]);
                        arr[i].drawEmotionShape();
                    }
                });
            }

            const TENSION_EXTENDED = [
                ['leftHand', 'rightHand'],
                ['leftFoot', 'rightFoot'],
                ['leftHand', 'leftFoot'],
                ['rightHand', 'rightFoot'],
                ['leftHand', 'rightFoot'],
                ['rightHand', 'leftFoot']
            ];

            TENSION_EXTENDED.forEach(([a, b]) => {
                const arrA = movePointsMap.get(a);
                const arrB = movePointsMap.get(b);
                if (arrA.length > 1 && arrB.length > 1) {

                    const lenA = arrA.length, lenB = arrB.length;
                    const idxA = replaying ? min(replayIndex, lenA - 1) : lenA - 1;
                    const idxB = replaying ? min(replayIndex, lenB - 1) : lenB - 1;

                    const vA = arrA[idxA].pos;
                    const vB = arrB[idxB].pos;
                    let dist = p5.Vector.dist(vA, vB);
                    let w = map(dist, 0, 1, 4, 0.5, true);

                    let c = lerpColor(cols[0], cols[1], 0.5);
                    c.setAlpha(180);
                    stroke(c);
                    strokeWeight(w);
                    line(vA.x, vA.y, vA.z, vB.x, vB.y, vB.z);
                }
            });


            for (let i = particles.length - 1; i >= 0; i--) {
                particles[i].update();
                particles[i].display();
                if (particles[i].isDead()) particles.splice(i, 1);
            }
            if (replaying) {
                replayFrameCounter++;
                if (replayFrameCounter % 5 === 0) {
                    replayIndex++;
                    if (replayIndex >= Math.min(...PARTS.map(p => movePointsMap.get(p).length))) {
                        replaying = false;
                        noLoop();
                    }
                }
            }
            return;
        }

        // body parts

        if (replaying) {

            for (let i = 0; i < replayIndex && i < movePoints.length - 1; i++) {
                movePoints[i].drawLine(movePoints[i + 1]);
                movePoints[i].drawEmotionShape();
            }
        } else {

            if (poses.length > 0) {
                let pose = poses[0];
                let idx = TRACKED_POINTS[currentTracking];
                let kp = pose.keypoints3D[idx];
                if (kp && kp.confidence > 0.5) {
                    let newPos = createVector(kp.x, kp.y, kp.z);
                    if (
                        movePoints.length === 0 ||
                        p5.Vector.dist(movePoints[movePoints.length - 1].pos, newPos) > 0.01
                    ) {
                        movePoints.push(new MovementPoint(newPos, millis(), amp));
                    }
                }
            }

            for (let i = 0; i < movePoints.length - 1; i++) {
                movePoints[i].drawLine(movePoints[i + 1]);
                movePoints[i].drawEmotionShape();
            }
        }

        let latest = movePoints.slice(-5);
        for (let i = 0; i < latest.length - 1; i++) {
            latest[i].spawnTrailParticles(latest[i + 1]);
        }


        if (ampDelta > 0.08 && movePoints.length > 0) {
            const lastP = movePoints[movePoints.length - 1].pos;
            const cols = currentEmotionColorPair;
            for (let i = 0; i < 20; i++) {
                const dir = p5.Vector.random3D().mult(random(1.5, 2.5));
                const color = lerpColor(cols[0], cols[1], random());
                particles.push(new Particle3D(lastP.copy(), dir, 0.01, color, ampVal));
            }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            particles[i].display();
            if (particles[i].isDead()) particles.splice(i, 1);
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
        this.pos = pos.copy();
        this.time = time;
        this.amp = amp;
        this.shouldDrawShape = true;

        this.shapeOffset = p5.Vector.random3D().mult(0.05);

        this.rotAngle = createVector(
            random(TWO_PI),
            random(TWO_PI),
            random(TWO_PI)
        );
        this.rotSpeed = createVector(
            random(-0.002, 0.002),
            random(-0.002, 0.002),
            random(-0.002, 0.002)
        );
    }
    speedTo(other) {
        let d = p5.Vector.dist(this.pos, other.pos);
        let t = (other.time - this.time) || 1;
        return d / t;
    }
    avgAmpWith(other) {
        return (this.amp + other.amp) / 2;
    }

    spawnTrailParticles(other) {
        const speed = this.speedTo(other);
        const midpoint = p5.Vector.add(this.pos, other.pos).mult(0.5);
        const style = getVisualByEmotion(currentEmotion);

        const particleCount = 2;
        for (let i = 0; i < particleCount; i++) {
            const offset = p5.Vector.random3D().mult(0.01);
            const direction = p5.Vector.random3D().mult(map(speed, 0, 0.005, 0.001, 0.01));
            const colorBlend = lerpColor(style.colors[0], style.colors[1], random());

            particles.push(new Particle3D(midpoint.copy().add(offset), direction, 0.1, colorBlend, speed * 2));
        }
    }
    drawLine(other) {
        const speed = this.speedTo(other);
        const amp = this.avgAmpWith(other);
        const style = getVisualByEmotion(currentEmotion);

        const speedNorm = map(speed, 0, 0.01, 0, 1, true);
        const ampNorm = map(amp, 0, 0.3, 0, 1, true);

        // const blendAmt = (ampNorm) / 2;

        const colorBlend = lerpColor(style.colors[0], style.colors[1], speedNorm);

        const thickness = map(ampNorm, 0, 1, 0.05, 50, true);

        stroke(colorBlend);
        strokeWeight(thickness);

        line(
            this.pos.x, this.pos.y, this.pos.z,
            other.pos.x, other.pos.y, other.pos.z
        );
    }
    drawEmotionShape(scaleFactor = 1.0) {
        if (!this.shouldDrawShape) return;
        const style = getVisualByEmotion(currentEmotion);

        const baseSize = map(this.amp, 0, 0.3, 0.02, 0.2, true) * scaleFactor;
        const strokeW = map(this.amp, 0, 0.3, 0.2, 10, true) * scaleFactor;

        this.rotAngle.add(this.rotSpeed);

        push();
        translate(
            this.pos.x + this.shapeOffset.x,
            this.pos.y + this.shapeOffset.y,
            this.pos.z + this.shapeOffset.z
        );

        rotateX(this.rotAngle.x);
        rotateY(this.rotAngle.y);
        rotateZ(this.rotAngle.z);

        const c = lerpColor(style.colors[0], style.colors[1], 0.5);
        fill(c);
        stroke(c);
        strokeWeight(strokeW);



        switch (currentEmotion) {
            case "happy":

                rotateX(millis() * 0.001);
                rotateY(millis() * 0.0015);
                torus(baseSize * 0.6, baseSize * 0.2, 24, 12);
                break;

            case "sad":

                rotateZ(sin(millis() * 0.001) * PI / 8);

                beginShape(LINES);

                vertex(-baseSize, baseSize, 0);
                vertex(baseSize, baseSize, 0);

                vertex(baseSize, baseSize, 0);
                vertex(0, -baseSize, 0);

                vertex(0, -baseSize, 0);
                vertex(-baseSize, baseSize, 0);
                endShape();
                break;


            case "peaceful":

                rotateY(millis() * 0.0005);
                sphere(baseSize * 0.6, 6, 6);
                break;

            case "fear":

                rotateX(-PI / 2);
                cone(baseSize * 0.5, baseSize * 1.2, 12, 1);
                break;

            case "angry":

                rotateX(millis() * 0.005);
                rotateY(millis() * 0.007);
                beginShape(LINES);

                vertex(0, baseSize, 0);
                vertex(-baseSize, -baseSize, baseSize);
                vertex(0, baseSize, 0);
                vertex(baseSize, -baseSize, baseSize);
                vertex(0, baseSize, 0);
                vertex(0, -baseSize, -baseSize);

                vertex(-baseSize, -baseSize, baseSize);
                vertex(baseSize, -baseSize, baseSize);
                vertex(baseSize, -baseSize, baseSize);
                vertex(0, -baseSize, -baseSize);
                vertex(0, -baseSize, -baseSize);
                vertex(-baseSize, -baseSize, baseSize);
                endShape();
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
    replayFrameCounter = 0;
    loop();

}

function switchTracking(part) {
    currentTracking = part;
    movePoints = [];

    video.time(0);
    video.pause();
    isPlaying = false;
    document.getElementById("playButton").innerText = "Play";

    if (handAudio) handAudio.stop();
    if (feetAudio) feetAudio.stop();
    if (wholeBodyAudio) wholeBodyAudio.stop();

    clearTimeout(trackingTimeout);
    trackingDisplay.innerText = `Current tracking: ${part}`;
    trackingDisplay.style.opacity = '1';
    trackingTimeout = setTimeout(() => {
        trackingDisplay.style.opacity = '0';
    }, 2000);
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