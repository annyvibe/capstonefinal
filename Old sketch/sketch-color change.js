const TRACKED_POINTS = {
    leftHand: 15,
    rightHand: 16,
    leftFoot: 27,
    rightFoot: 28
};

let movePoints = []; // ***
let currentEmotion = "happy";

let video;
let bodyPose;
let poses = [];
let currentTracking = "leftHand";

// ui elements
let playPauseButton, replayButton, progressSlider;
let leftHandButton, rightHandButton, leftFootButton, rightFootButton;
let expandButton, shrinkButton;

// states
let replaying = false;
let replayIndex = 0;
let videoExpanded = false;
let isPlaying = false;

// audio-related
let handAudio, feetAudio;
let handAmp, feetAmp;

function preload() {
    bodyPose = ml5.bodyPose("BlazePose");
    handAudio = loadSound('assets/cyh happy/hand cyh happy.mp3');
    feetAudio = loadSound('assets/cyh happy/feet cyh happy.mp3');
}

function setup() {
    createCanvas(windowWidth, windowHeight, WEBGL);

    // // sound
    // handAmp = new p5.Amplitude();
    // feetAmp = new p5.Amplitude();
    // handAmp.setInput(handAudio);
    // feetAmp.setInput(feetAudio);
    // handAudio.stop();
    // feetAudio.stop();

    // // video
    // video = createVideo("assets/cyh happy/cyh happy1.mp4", function () {
    //     console.log("video loaded");
    // });
    // video.size(180, 320);
    // video.position(10, 10);
    // video.volume(0);
    // video.elt.onloadeddata = function () {
    //     video.pause();
    // };
    // video.elt.onplay = function () {
    //     startPoseDetection();
    // };
    // video.onended(function () {
    //     handAudio.pause();
    //     feetAudio.pause();
    //     isPlaying = false;
    //     playPauseButton.html("Play");
    // });

    // buttons - check bottom.
    createButtons();
    loadEmotionVideo("happy");

}
function loadEmotionVideo(emotion) {
    currentEmotion = emotion;
    movePoints = [];
    if (handAudio) handAudio.stop();
    if (feetAudio) feetAudio.stop();


    if (video) {
        video.remove();
    }

    let videoPath = "assets/cyh " + emotion + "/cyh " + emotion + ".mp4";
    video = createVideo(videoPath, () => {
        console.log("Loaded video for", emotion);
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

    let handAudioPath = "assets/cyh " + emotion + "/hand cyh " + emotion + ".mp3";
    let feetAudioPath = "assets/cyh " + emotion + "/feet cyh " + emotion + ".mp3";

    handAudio = loadSound(handAudioPath, () => {
        console.log("Loaded hand audio for", emotion);
        handAmp = new p5.Amplitude();
        handAmp.setInput(handAudio);
    });

    feetAudio = loadSound(feetAudioPath, () => {
        console.log("Loaded feet audio for", emotion);
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
        scale(height / 2); // consider redesigning scale
        orbitControl();

        // update pose and push movePoints
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

        // smooth movePoints
        //let points = smoothTrail(movePoints, 5);
        let points = movePoints;

        // display movePoints
        for (let i = 0; i < points.length - 1; i++) {
            let pt = points[i];
            let nextPt = points[i + 1];
            if (!replaying || i <= replayIndex) {
                pt.drawLine(nextPt);
                // pt.drawBox(); // ***
                pt.drawEmotionShape();
            }
        }

        if (replaying) {
            replayIndex++;
            if (replayIndex >= points.length - 1) {
                replaying = false;
            }
        }
    }
}

class MovementPoint {
    constructor(pos, time, amp) {
        this.pos = pos;
        this.time = time;
        this.amp = amp;
        //
        this.addtionalPos = createVector(random(-0.01, 0.01), random(-0.01, 0.01), random(-0.01, 0.01))
        this.shouldDrawShape = (random(1) < 0.3);
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
        let speed = this.speedTo(other);
        let avgAmp = this.avgAmpWith(other);

        let colorVal = map(speed, 0, 0.002, 10, 255, true);
        let thickness = map(pow(avgAmp, 3), 0, 1.0, 1, 400, true);

        push();
        stroke(colorVal);
        strokeWeight(thickness);
        noFill();
        line(this.pos.x, this.pos.y, this.pos.z, other.pos.x, other.pos.y, other.pos.z);
        pop();
    }
    // drawBox() {
    //     push();
    //     // position
    //     translate(this.pos.x + this.addtionalPos.x,
    //         this.pos.y + + this.addtionalPos.y, this.pos.z + + this.addtionalPos.z);

    //     // draw
    //     noFill();
    //     stroke(255, 0, 0);
    //     box(0.005);

    //     pop();
    // }
    drawEmotionShape() {
        if (!this.shouldDrawShape) return;
        const style = getVisualByEmotion(currentEmotion);

        let baseSize = map(pow(this.amp, 4), 0, 1.0, 0.05, 1.0, true);
        let strokeW = map(pow(this.amp, 4), 0, 1.0, 0.2, 200, true);

        // 颜色呼吸变化
        let t = sin(millis() * 0.001); // t在-1到1之间
        let lerpAmt = map(t, -1, 1, 0, 1); // 映射到0~1之间
        let c = lerpColor(style.colors[0], style.colors[1], lerpAmt); // 两个颜色之间渐变

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

function expandVideo() {
    let targetHeight = windowHeight;
    let targetWidth = targetHeight * 0.5625;

    video.size(targetWidth, targetHeight);
    video.position((windowWidth - targetWidth) / 2, 0);

    videoExpanded = true;
    expandButton.hide();
    shrinkButton.show();
}

function shrinkVideo() {

    video.size(180, 320);
    video.position(0, 0);

    videoExpanded = false;
    shrinkButton.hide();
    expandButton.show();
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

function createButtons() {
    playPauseButton = createButton("Play");
    playPauseButton.position(10, 400);
    playPauseButton.mousePressed(togglePlayPause);

    replayButton = createButton("Track Replay");
    replayButton.position(80, 400);
    replayButton.mousePressed(replayTrack);

    progressSlider = createSlider(0, 1, 0, 0.01);
    progressSlider.position(10, 430);
    progressSlider.style("width", "200px");
    progressSlider.input(updateVideoTime);

    leftHandButton = createButton("LH");
    leftHandButton.position(10, 470);
    leftHandButton.mousePressed(function () { switchTracking("leftHand"); });

    rightHandButton = createButton("RH");
    rightHandButton.position(60, 470);
    rightHandButton.mousePressed(function () { switchTracking("rightHand"); });

    leftFootButton = createButton("LF");
    leftFootButton.position(110, 470);
    leftFootButton.mousePressed(function () { switchTracking("leftFoot"); });

    rightFootButton = createButton("RF");
    rightFootButton.position(160, 470);
    rightFootButton.mousePressed(function () { switchTracking("rightFoot"); });

    expandButton = createButton("Zoom In");
    expandButton.position(0, 350);
    expandButton.mousePressed(expandVideo);

    shrinkButton = createButton("Zoom Out");
    shrinkButton.position(0, 350);
    shrinkButton.mousePressed(shrinkVideo);
    shrinkButton.hide();

    let emotions = ["happy", "sad", "peaceful", "angry", "fear"];
    emotions.forEach((emo, idx) => {
        let btn = createButton(emo.toUpperCase());
        btn.position(10 + idx * 70, 510);
        btn.mousePressed(() => loadEmotionVideo(emo));
    });
}
function getVisualByEmotion(emotion) {
    const styles = {
        happy: {
            colors: [color(255, 165, 0), color(255, 220, 100)], shape: "circle"
        }, // bright orange ←→ light gold
        sad: {
            colors: [color(0, 80, 160), color(100, 150, 255)], shape: "oval"
        }, // deep blue ←→ soft blue
        peaceful: {
            colors: [color(173, 216, 230), color(200, 250, 250)], shape: "parallelogram"
        }, // pastel blue ←→ icy cyan
        angry: {
            colors: [color(139, 0, 0), color(255, 30, 30)], shape: "spikyball"
        }, // crimson ←→ bright red
        fear: {
            colors: [color(80, 60, 100), color(140, 100, 180)], shape: "triangleDown"
        } // purple-gray ←→ glowing violet
    };
    return styles[emotion];
}