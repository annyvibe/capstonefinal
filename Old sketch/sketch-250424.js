let video;
let bodyPose;
let connections;
let poses = [];
let trails = new Map();
let playPauseButton, replayButton, progressSlider;
let leftHandButton, rightHandButton, leftFootButton, rightFootButton;
let expandButton, shrinkButton;
let replaying = false;
let replayIndex = 0;
let videoExpanded = false;
let isPlaying = false;
let handAudio, feetAudio;
let handAmp, feetAmp;

const TRACKED_POINTS = {
    leftHand: 15,
    rightHand: 16,
    leftFoot: 27,
    rightFoot: 28
};

let currentTracking = "leftHand";

function preload() {
    bodyPose = ml5.bodyPose("BlazePose");
    handAudio = loadSound('assets/cyh sad/hand1cyh sad.mp3');
    feetAudio = loadSound('assets/cyh sad/Feet1cyh sad.mp3');
}

function gotPoses(results) {
    poses = results;
}

function setup() {
    createCanvas(windowWidth, windowHeight, WEBGL);
    handAmp = new p5.Amplitude();
    feetAmp = new p5.Amplitude();
    handAmp.setInput(handAudio);
    feetAmp.setInput(feetAudio);

    handAudio.stop();
    feetAudio.stop();
    video = createVideo("assets/cyh sad/cyh sad.mp4", () => {
        console.log("video loaded");
    });
    video.size(320, 180);
    video.position(10, 10);
    video.elt.onloadeddata = () => {
        console.log("video data loaded");
        video.pause();
    };
    video.elt.onplay = () => {
        console.log("pose detecting start");
        startPoseDetection();
    };
    video.onended(() => {
        handAudio.pause();
        feetAudio.pause();
        isPlaying = false;
        playPauseButton.html("Play");
    });
    playPauseButton = createButton("Play");
    playPauseButton.position(10, 200);
    playPauseButton.mousePressed(togglePlayPause);

    replayButton = createButton("Track Replay");
    replayButton.position(80, 200);
    replayButton.mousePressed(replayTrack);

    progressSlider = createSlider(0, 1, 0, 0.01);
    progressSlider.position(10, 230);
    progressSlider.style("width", "200px");
    progressSlider.input(updateVideoTime);

    leftHandButton = createButton("LH");
    leftHandButton.position(10, 270);
    leftHandButton.mousePressed(() => switchTracking("leftHand"));

    rightHandButton = createButton("RH");
    rightHandButton.position(60, 270);
    rightHandButton.mousePressed(() => switchTracking("rightHand"));

    leftFootButton = createButton("LF");
    leftFootButton.position(110, 270);
    leftFootButton.mousePressed(() => switchTracking("leftFoot"));

    rightFootButton = createButton("RF");
    rightFootButton.position(160, 270);
    rightFootButton.mousePressed(() => switchTracking("rightFoot"));

    expandButton = createButton("Zoom In");
    expandButton.position(0, 0);
    expandButton.mousePressed(expandVideo);

    shrinkButton = createButton("Zoom Out");
    shrinkButton.position(0, 0);
    shrinkButton.mousePressed(shrinkVideo);
    shrinkButton.hide();

    connections = bodyPose.getSkeleton();
    trails.set(TRACKED_POINTS[currentTracking], []);
}

function startPoseDetection() {
    bodyPose.detectStart(video, gotPoses);
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function switchTracking(part) {
    currentTracking = part;
    trails.clear();
    trails.set(TRACKED_POINTS[currentTracking], []);
    video.time(0);
    video.pause();
    isPlaying = false;
    playPauseButton.html("Play");
    handAudio.pause();
    feetAudio.pause();

    if (part === "leftHand" || part === "rightHand") {
        handAudio.jump(0);
    } else if (part === "leftFoot" || part === "rightFoot") {
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
        if (currentTracking === "leftHand" || currentTracking === "rightHand") {
            handAudio.play();
        } else if (currentTracking === "leftFoot" || currentTracking === "rightFoot") {
            feetAudio.play();
        }
        playPauseButton.html("Pause");
    }
    isPlaying = !isPlaying;
}

function updateVideoTime() {
    let newTime = progressSlider.value() * video.duration();
    video.time(newTime);
    updateTrailForTime(newTime);
    if (currentTracking === "leftHand" || currentTracking === "rightHand") {
        handAudio.jump(newTime);
    } else if (currentTracking === "leftFoot" || currentTracking === "rightFoot") {
        feetAudio.jump(newTime);
    }
}

function updateTrailForTime(time) {
    trails.clear();
    trails.set(TRACKED_POINTS[currentTracking], []);
    bodyPose.detect(video, (results) => {
        poses = results;
        if (poses.length > 0) {
            let pose = poses[0];
            let index = TRACKED_POINTS[currentTracking];
            let keypoint = pose.keypoints3D[index];

            if (keypoint && keypoint.confidence > 0.5) {
                let trail = trails.get(index);
                let newPos = createVector(keypoint.x, keypoint.y, keypoint.z);
                trail.push({
                    pos: newPos,
                    time: millis()
                });
            }
        }
    });
}

function replayTrack() {
    replaying = true;
    replayIndex = 0;
}

function expandVideo() {
    video.size(windowWidth, windowHeight);
    video.position(0, 0);
    videoExpanded = true;
    expandButton.hide();
    shrinkButton.show();
}

function shrinkVideo() {
    video.size(320, 180);
    video.position(10, 10);
    videoExpanded = false;
    shrinkButton.hide();
    expandButton.show();
}

function smoothTrail(trail, windowSize) {
    let smoothedTrail = [];
    for (let i = 0; i < trail.length; i++) {
        let sum = createVector(0, 0, 0);
        let ampSum = 0;
        let count = 0;
        for (let j = Math.max(0, i - windowSize); j <= Math.min(trail.length - 1, i + windowSize); j++) {
            sum.add(trail[j].pos);
            ampSum += trail[j].amp || 0;
            count++;
        }
        smoothedTrail.push({
            pos: p5.Vector.div(sum, count),
            time: trail[i].time,
            amp: ampSum / count
        });
    }
    return smoothedTrail;
}

function draw() {
    if (!videoExpanded) {
        background(0);
        scale(height / 2);
        orbitControl();


        if (!replaying && poses.length > 0) {
            let pose = poses[0];
            let index = TRACKED_POINTS[currentTracking];
            let keypoint = pose.keypoints3D[index];

            if (keypoint && keypoint.confidence > 0.5) {
                let newPos = createVector(keypoint.x, keypoint.y, keypoint.z);
                let trail = trails.get(index);

                let amp = currentTracking.includes("Hand") ? handAmp.getLevel() : feetAmp.getLevel();

                if (trail.length === 0 || p5.Vector.dist(trail[trail.length - 1].pos, newPos) > 0.01) {
                    trail.push({ pos: newPos, time: millis(), amp: amp });
                }
            }
        }

        trails.forEach((trail, index) => {
            let smoothedTrail = smoothTrail(trail, 5);
            if (smoothedTrail.length < 2) return;

            for (let i = 0; i < smoothedTrail.length - 1; i++) {
                let p1 = smoothedTrail[i];
                let p2 = smoothedTrail[i + 1];
                let avgAmp = (p1.amp + p2.amp) / 2;

                let thickness;
                if (index === TRACKED_POINTS.leftHand || index === TRACKED_POINTS.rightHand) {
                    thickness = map(pow(avgAmp, 3), 0, 1.0, 1, 300, true);
                } else if (index === TRACKED_POINTS.leftFoot || index === TRACKED_POINTS.rightFoot) {
                    thickness = map(avgAmp ** 3, 0, 1.0, 1, 300, true);
                }

                let speed = p5.Vector.dist(p1.pos, p2.pos) / ((p2.time - p1.time) || 1);
                let c = map(speed, 0, 0.002, 10, 255, true);

                stroke(c);
                strokeWeight(thickness);
                noFill();
                line(p1.pos.x, p1.pos.y, p1.pos.z, p2.pos.x, p2.pos.y, p2.pos.z);
            }

            if (replaying) {
                if (replayIndex < smoothedTrail.length) {
                    for (let i = 0; i < smoothedTrail.length; i += 4) {
                        let endIndex = Math.min(i + 4, smoothedTrail.length - 1);

                        let pos1 = smoothedTrail[i].pos;
                        let pos2 = smoothedTrail[endIndex].pos;
                        let startTime = smoothedTrail[i].time;
                        let endTime = smoothedTrail[endIndex].time;

                        let timeDiff = endTime - startTime;
                        let distance = p5.Vector.dist(pos1, pos2);
                        let speed = distance / (timeDiff || 1);
                        let c = map(speed, 0, 0.002, 10, 255, true);
                        stroke(c);

                        for (let j = i; j < endIndex; j++) {
                            if (j <= replayIndex) {
                                let pos1 = smoothedTrail[j].pos;
                                let pos2 = smoothedTrail[j + 1].pos;
                                line(pos1.x, pos1.y, pos1.z, pos2.x, pos2.y, pos2.z);
                            }
                        }
                    }

                    let index = 0;
                    for (let i = 0; i < smoothedTrail.length; i++) {

                        if (i >= index && i <= replayIndex) {
                            let pos = smoothedTrail[i].pos;
                            let ctime = smoothedTrail[i].time;

                            let consecutiveCount = 0;
                            let lastIndex = i;
                            for (let j = i + 1; j < smoothedTrail.length; j++) {
                                let nextPos = smoothedTrail[j].pos;
                                let distance = p5.Vector.dist(pos, nextPos);
                                if (distance < 0.1) {
                                    consecutiveCount++;
                                    lastIndex = j;
                                } else {
                                    break;
                                }
                            }


                        }
                    }

                    replayIndex++;
                } else {
                    replaying = false;
                }
            } else {
                for (let i = 0; i < smoothedTrail.length; i += 4) {
                    let endIndex = Math.min(i + 4, smoothedTrail.length - 1);

                    let pos1 = smoothedTrail[i].pos;
                    let pos2 = smoothedTrail[endIndex].pos;
                    let startTime = smoothedTrail[i].time;
                    let endTime = smoothedTrail[endIndex].time;

                    let timeDiff = endTime - startTime;
                    let distance = p5.Vector.dist(pos1, pos2);
                    let speed = distance / (timeDiff || 1);
                    let c = map(speed, 0, 0.002, 10, 255, true);
                    stroke(c);

                    for (let j = i; j < endIndex; j++) {
                        let pos1 = smoothedTrail[j].pos;
                        let pos2 = smoothedTrail[j + 1].pos;
                        line(pos1.x, pos1.y, pos1.z, pos2.x, pos2.y, pos2.z);
                    }
                }

                let index = 0;
                for (let i = 0; i < smoothedTrail.length; i++) {

                    if (i >= index) {
                        let pos = smoothedTrail[i].pos;
                        let ctime = smoothedTrail[i].time;

                        let consecutiveCount = 0;
                        let lastIndex = i;
                        for (let j = i + 1; j < smoothedTrail.length; j++) {
                            let nextPos = smoothedTrail[j].pos;
                            let distance = p5.Vector.dist(pos, nextPos);
                            if (distance < 0.1) {
                                consecutiveCount++;
                                lastIndex = j;
                            } else {
                                break;
                            }
                        }


                    }
                }

            }
        });

    }
}

function mousePressed() {
    console.log(poses);
}