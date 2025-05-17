const TRACKED_POINTS = {
    leftHand: 15,
    rightHand: 16,
    leftFoot: 27,
    rightFoot: 28,
};

const PARTS = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'];
let movePointsMap = new Map();
PARTS.forEach(p => movePointsMap.set(p, []));

let replaying = false;
let replayIndex = 0;

let movePoints = [];
let video, bodyPose, poses = [];
let currentTracking = "leftHand";
let mic, amp;
let isRecording = false;
let particles = [];
let shapes = [];
const BODY_SCALE = 2.0;

let selectedVoice = null;

function preload() {
    bodyPose = ml5.bodyPose("BlazePose");
}


function setup() {
    createCanvas(windowWidth, windowHeight, WEBGL);

    video = createCapture({
        video: {
            deviceId: { exact: "e83bd270f13e30471bd2135d9dcc64ba09c9253d34974923c6a25cd5fc7e0139" }
        },
        audio: false
    });
    video.size(320, 180);


    mic = new p5.AudioIn();
    mic.start(() => {
        amp = new p5.Amplitude();
        amp.setInput(mic);
    });

    bodyPose.detectStart(video, gotPoses);

    document.getElementById("startBtn").onclick = () => {
        hideStartupHint();
        movePoints = [];
        isRecording = true;
        showMessage("Start Recording");
    };

    document.getElementById("stopBtn").onclick = () => {
        isRecording = false;

        if (currentTracking === 'wholeBody') {

            const speeds = [];
            PARTS.forEach(part => {
                const arr = movePointsMap.get(part);
                for (let i = 0; i < arr.length - 1; i++) {
                    speeds.push(arr[i].speedTo(arr[i + 1]));
                }
            });
            if (speeds.length) {
                const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
                const { label, advice } = getEmotionTextBySpeed(avgSpeed);
                const vMsg = `I think you feel ${label} today.\n${advice}`;
                const sMsg = `I think you feel ${label} today. ${advice}`;
                speakText(sMsg, vMsg);
            }
        }
        else if (movePoints.length >= 2) {

            let totalSpeed = 0;
            for (let i = 0; i < movePoints.length - 1; i++) {
                totalSpeed += movePoints[i].speedTo(movePoints[i + 1]);
            }
            const avgSpeed = totalSpeed / (movePoints.length - 1);
            const { label, advice } = getEmotionTextBySpeed(avgSpeed);
            const vMsg = `I think you feel ${label} today.\n${advice}`;
            const sMsg = `I think you feel ${label} today. ${advice}`;
            speakText(sMsg, vMsg);
        }

    };

    document.getElementById("clearBtn").onclick = () => {

        movePoints = [];
        movePointsMap.forEach(arr => arr.length = 0);
        shapes.forEach(s => {
            s.lifeReduction = 20;
        });

        showMessage("Clear Trajectory");
    };

    document.querySelectorAll(".trackBtn").forEach(btn =>
        btn.onclick = () => {
            currentTracking = btn.getAttribute("data-track");
            showMessage("Switched to " + currentTracking);
        }
    );

    document.getElementById("saveBtn").onclick = () => {
        if (movePoints.length === 0) {
            alert("No movement to save yet!");
            return;
        }
        let userName = prompt("Please enter your name:");
        if (!userName) userName = "Anonymous";


        const replayBtn = document.getElementById('replayBtn');
        replayBtn.onclick = () => {
            if (movePoints.length > 1) {
                isRecording = false;
                replaying = true;
                replayIndex = 0;
                showMessage('Replaying');
            }
        };


        const simplified = [];
        for (let i = 0; i < movePoints.length - 1; i++) {
            const p = movePoints[i];
            const next = movePoints[i + 1];
            const speed = p.speedTo(next);
            const ampAvg = p.avgAmpWith(next);
            const style = getVisualBySpeed(speed);

            const t = sin(p.time * 0.001);
            const lerpAmt = map(t, -1, 1, 0, 1);
            const colorVec = lerpColor(style.colors[0], style.colors[1], lerpAmt);
            const colorArr = [
                red(colorVec),
                green(colorVec),
                blue(colorVec)
            ];


            const speedNorm = map(speed, 0, 0.01, 0, 1, true);
            const ampNorm = map(ampAvg, 0, 0.3, 0, 1, true);
            const control = max(speedNorm, ampNorm);
            const thickness = map(control, 0, 1, 0.05, 100, true);

            const baseSize = map(pow(ampAvg, 4), 0, 1, 0.05, 1, true);

            simplified.push({
                x: p.pos.x,
                y: p.pos.y,
                z: p.pos.z,
                time: p.time,
                amp: p.amp,
                shape: style.shape,
                color: colorArr,
                thickness,
                baseSize
            });
        }

        const saved = JSON.parse(localStorage.getItem("userTracks") || "[]");
        saved.push({
            timestamp: Date.now(),
            name: userName,
            data: simplified
        });
        localStorage.setItem("userTracks", JSON.stringify(saved));

        alert(` "${userName}"'s 3D emotion map has been saved to User Archive!`);
    };
}

function draw() {
    background(0);
    orbitControl();

    scale(height / 2);

    drawVideoPreview();

    if (replaying) {
        for (let i = 0; i < replayIndex && i < movePoints.length - 1; i++) {
            movePoints[i].drawLine(movePoints[i + 1]);
            movePoints[i].drawShape(movePoints[i + 1]);
        }
        replayIndex++;
        if (replayIndex >= movePoints.length) {
            replaying = false;
            showMessage('Replay 完成');
        }
        return;
    }

    if (currentTracking === 'wholeBody') {
        if (isRecording && poses.length > 0) {
            PARTS.forEach(part => {
                let idx = TRACKED_POINTS[part];
                let kp = poses[0].keypoints3D[idx];
                if (kp && kp.confidence > 0.5) {
                    let arr = movePointsMap.get(part);
                    let v = createVector(-kp.x, kp.y + 0.5, kp.z).mult(BODY_SCALE);
                    let vol = amp.getLevel();
                    if (!arr.length || p5.Vector.dist(arr[arr.length - 1].pos, v) > 0.01) {
                        arr.push(new MovementPoint(v, millis(), vol));
                    }
                    if (arr.length > 80) arr.shift();
                }
            });
        }

        PARTS.forEach(part => {
            let arr = movePointsMap.get(part);
            let len = arr.length;
            for (let i = 0; i < len - 1; i++) {
                arr[i].drawLine(arr[i + 1]);
                arr[i].drawShape(arr[i + 1]);
            }
        });
    }

    if (isRecording && poses.length > 0) {
        let idxPt = TRACKED_POINTS[currentTracking];
        let kp = poses[0].keypoints3D[idxPt];
        if (kp && kp.confidence > 0.5) {
            let v = createVector(-kp.x, kp.y + 0.5, kp.z).mult(BODY_SCALE);
            let vol = amp.getLevel();
            if (!movePoints.length
                || p5.Vector.dist(movePoints[movePoints.length - 1].pos, v) > 0.01) {
                movePoints.push(new MovementPoint(v, millis(), vol));
            }
        }
    }

    for (let i = 0; i < movePoints.length - 1; i++) {
        movePoints[i].drawLine(movePoints[i + 1]);
        movePoints[i].drawShape(movePoints[i + 1]);

        movePoints[i].spawnTrailParticles(movePoints[i + 1]);
    }

    updateUIBars();

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].display();
        if (particles[i].isDead()) particles.splice(i, 1);
    }
    while (particles.length > 5000) particles.shift();

    for (let i = shapes.length - 1; i >= 0; i--) {
        shapes[i].update();
        shapes[i].display();
        if (shapes[i].isDead()) shapes.splice(i, 1);
    }
    while (shapes.length > 100) shapes.shift();
}

function drawVideoPreview() {
    push();
    translate(-windowWidth / 2 + 160, -windowHeight / 2 + 90, 0);
    rotateY(PI);
    texture(video);
    noStroke();
    plane(320, 180);
    pop();
}

function updateUIBars() {
    if (!amp) return;
    const vol = amp.getLevel();
    let speed = 0;
    if (movePoints.length >= 2) {
        speed = movePoints[movePoints.length - 2].speedTo(movePoints[movePoints.length - 1]);
    }
    document.getElementById("volumeFill").style.width = map(vol, 0, 0.3, 0, 100) + "%";
    document.getElementById("speedFill").style.width = map(speed, 0, 0.01, 0, 100) + "%";
}

function gotPoses(results) {
    poses = results;
}

class MovementPoint {
    constructor(pos, time, amp) {
        this.pos = pos.copy();
        this.time = time;
        this.amp = amp;
        this.shouldDrawShape = random() < 0.3;
        this._thickness = 1;
        this._baseSize = 0.1;
        this._color = color(255);
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
        const style = getVisualBySpeed(speed);

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
        const style = getVisualBySpeed(speed);
        const colorBlend = lerpColor(style.colors[0], style.colors[1], random());
        const speedNorm = map(speed, 0, 0.01, 0, 1, true);
        const ampNorm = map(amp, 0, 0.3, 0, 1, true);

        const control = max(ampNorm, speedNorm);

        const thickness = map(control, 0, 1.0, 0.05, 100, true);

        stroke(colorBlend);
        strokeWeight(thickness);
        line(this.pos.x, this.pos.y, this.pos.z, other.pos.x, other.pos.y, other.pos.z);
        this.spawnTrailParticles(other);
    }
    drawShape(other) {
        const speed = this.speedTo(other);
        const amp = this.avgAmpWith(other);

        const style = getVisualBySpeed(speed);

        let sizeAmp = map(pow(amp, 4), 0, 1, 0.05, 1, true);
        let sizeSpeed = map(speed, 0, 0.01, 0.05, 1, true);
        const baseSize = (sizeAmp + sizeSpeed) / 2;
        const strokeW = map(pow(amp, 4), 0, 1, 0.2, 100);

        let t = sin(millis() * 0.001);
        let lerpAmt = map(t, -1, 1, 0, 1);
        let c = lerpColor(style.colors[0], style.colors[1], lerpAmt);

        push();
        translate(this.pos.x, this.pos.y, this.pos.z);
        fill(c);
        stroke(c);
        strokeWeight(strokeW);

        switch (style.shape) {
            case "circle":
                rotateX(millis() * 0.001);
                rotateY(millis() * 0.0015);
                torus(baseSize * 0.6, baseSize * 0.2, 24, 12);
                break;
            case "oval":
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
            case "parallelogram":
                rotateY(millis() * 0.0005);
                sphere(baseSize * 0.6, 6, 6);
                break;

            case "spikyball":
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
            case "triangleDown":
                rotateX(-PI / 2);
                cone(baseSize * 0.5, baseSize * 1.2, 12, 1);
                break;
        }
        pop();
    }
}

class Particle3D {
    constructor(pos, dir, speed, col, amp = 0.1) {
        this.pos = pos;
        this.vel = p5.Vector.mult(dir, speed);
        this.color = col;
        this.size = map(amp, 0, 1, 0.005, 0.02, true);
        this.life = 255;
        this.lifeReduction = random(2, 4);
    }
    update() {
        this.pos.add(this.vel);
        this.vel.mult(1.05);
        this.life -= this.lifeReduction;
    }
    isDead() {
        return this.life <= 0;
    }
    display() {
        push();
        translate(this.pos.x, this.pos.y, this.pos.z);
        noStroke();
        fill(red(this.color), green(this.color), blue(this.color), this.life);
        sphere(this.size);
        pop();
    }
}

class Shape3D {
    constructor(pos, size, col, shape) {
        this.pos = pos.copy();
        this.vel = p5.Vector.random3D().mult(0.002);
        this.size = size;
        this.shape = shape;
        this.color = col;
        this.rotX = random(TWO_PI);
        this.rotY = random(TWO_PI);
        this.rotZ = random(TWO_PI);
        this.rotSpeedX = random(-0.005, 0.005);
        this.rotSpeedY = random(-0.005, 0.005);
        this.rotSpeedZ = random(-0.005, 0.005);
        this.life = 255;
        this.lifeReduction = random(0.1, 1);
    }
    update() {
        this.pos.add(this.vel);
        this.vel.mult(0.98);
        this.rotX += this.rotSpeedX;
        this.rotY += this.rotSpeedY;
        this.rotZ += this.rotSpeedZ;
        this.life -= this.lifeReduction;
    }
    isDead() {
        return this.life <= 0;
    }
    display() {

        const speed = this.vel.mag();
        const style = getVisualBySpeed(speed);

        const c = lerpColor(style.colors[0], style.colors[1], 0.5);

        push();

        translate(this.pos.x, this.pos.y, this.pos.z);
        rotateX(this.rotX);
        rotateY(this.rotY);
        rotateZ(this.rotZ);

        fill(c);
        noStroke();

        switch (style.shape) {
            case "circle":
                sphere(this.size);
                break;
            case "oval":
                push();
                scale(1.2, 0.5, 1.2);
                sphere(this.size);
                pop();
                break;
            case "parallelogram":
                box(this.size * 2, this.size, this.size * 0.5);
                break;
            case "spikyball":

                drawSpikyBall(this.size, 10, 0.3);
                break;
            case "triangleDown":
                rotateX(-PI / 2);
                cone(this.size, this.size * 2);
                break;
        }
        pop();
    }
}
function switchTracking(part) {

    currentTracking = part;
    movePoints = [];
    movePointsMap.forEach(arr => arr.length = 0);
    shapes = [];
    particles = [];

    replaying = false;
    replayIndex = 0;

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

function replayTrack() {

    replaying = true;
    replayIndex = 0;
}

function getVisualBySpeed(speed) {
    colorMode(RGB);
    if (speed < 0.0005) return { colors: [color(180, 255, 240), color(200, 255, 255)], shape: "parallelogram" };
    else if (speed < 0.001) return { colors: [color(160, 220, 220), color(200, 240, 240)], shape: "parallelogram" };
    else if (speed < 0.0015) return { colors: [color(140, 200, 230), color(180, 230, 250)], shape: "oval" };
    else if (speed < 0.002) return { colors: [color(100, 180, 250), color(120, 210, 255)], shape: "oval" };
    else if (speed < 0.0025) return { colors: [color(255, 255, 200), color(255, 240, 180)], shape: "circle" };
    else if (speed < 0.003) return { colors: [color(255, 220, 150), color(255, 200, 100)], shape: "circle" };
    else if (speed < 0.0035) return { colors: [color(255, 180, 100), color(255, 150, 50)], shape: "triangleDown" };
    else if (speed < 0.004) return { colors: [color(200, 100, 150), color(230, 120, 170)], shape: "triangleDown" };
    else if (speed < 0.0045) return { colors: [color(180, 60, 100), color(220, 80, 120)], shape: "spikyball" };
    else return { colors: [color(255, 0, 0), color(255, 100, 80)], shape: "spikyball" };
}

function getEmotionTextBySpeed(speed) {
    if (speed < 0.0005) return { label: "calm", advice: "Enjoy the peace. Maybe take a moment to breathe deeply." };
    else if (speed < 0.001) return { label: "tired", advice: "Maybe it's a good idea to take a nap and be kind to yourself." };
    else if (speed < 0.0015) return { label: "peaceful", advice: "Keep that peace close to you as you move through the day." };
    else if (speed < 0.002) return { label: "focused", advice: "You're in the zone. Channel it to something meaningful." };
    else if (speed < 0.0025) return { label: "neutral", advice: "A steady state is powerful. Trust in your rhythm." };
    else if (speed < 0.003) return { label: "motivated", advice: "Use that energy to do one thing you've been putting off!" };
    else if (speed < 0.0035) return { label: "excited", advice: "Let that excitement inspire others too." };
    else if (speed < 0.004) return { label: "anxious", advice: "Take a breath. Maybe a short walk will help calm your nerves." };
    else if (speed < 0.0045) return { label: "frustrated", advice: "It's okay to feel stuck. Try stepping away for a little bit." };
    else return { label: "overwhelmed", advice: "Give yourself permission to pause and reset. You've done enough for now." };
}

function showMessage(text, duration = 1000) {
    const el = document.getElementById("statusMessage");
    if (!el) return;
    el.innerText = text;
    el.style.display = "block";
    clearTimeout(el._hideTimer);
    if (duration !== null) {
        el._hideTimer = setTimeout(() => {
            el.style.display = "none";
        }, duration);
    }
}

function hideStartupHint() {
    const el = document.getElementById("startupHint");
    if (el) el.style.display = "none";
}

function speakText(spokenText, visibleText = null) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(spokenText);
        utterance.lang = 'en-US';
        utterance.pitch = 1.1;
        utterance.rate = 0.95;
        utterance.volume = 1.0;

        if (selectedVoice) utterance.voice = selectedVoice;

        const el = document.getElementById("emotionFeedback");
        if (el) {
            el.innerText = visibleText || spokenText;
            el.style.display = "block";
            el.style.opacity = 1;
        }

        utterance.onend = () => {
            if (el) {
                el.style.opacity = 0;
                setTimeout(() => {
                    el.style.display = "none";
                }, 300);
            }
        };

        speechSynthesis.speak(utterance);
    }
}

window.speechSynthesis.onvoiceschanged = () => {
    const voices = speechSynthesis.getVoices();
    selectedVoice =
        voices.find(v => v.name === 'Shelley') ||

        voices.find(v => v.name.includes('Google US English')) ||

        voices[0];
};