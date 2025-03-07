import { avatarConfig } from "./avatarConfig.js";

// Global variables
let sessionInfo = null;
let room = null;
let mediaStream = null;
let webSocket = null;
let sessionToken = null;

// DOM Elements
const mediaElement = document.getElementById("mediaElement");
const avatarID = document.getElementById("avatarID");
const voiceID = document.getElementById("voiceID");
const kbID = document.getElementById("kbID");
const taskInput = document.getElementById("taskInput");
const password = document.getElementById("password");
const startBtn = document.getElementById("startBtn");
const closeBtn = document.getElementById("closeBtn");
const talkBtn = document.getElementById("talkBtn");
const startVoiceBtn = document.getElementById("start-btn");
let context = [];

// Event Listeners

//Start on Click
startBtn.addEventListener("click", async () => {
    console.log("startBtn");

    //Add loading spinner
    startBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Cargando...`;
    startBtn.classList.add("disabled-button");
    await createNewSession();
    await startStreamingSession();
    startBtn.innerHTML = "Conectar Avatar";
    startVoiceBtn.classList.remove("disabled-button");
    talkBtn.classList.remove("disabled-button");
});

//Close on Click
closeBtn.addEventListener("click", closeSession);

//Chat on Click
talkBtn.addEventListener("click", () => {
    const text = taskInput.value.trim();
    console.log("text", text);
    if (text) {
        sendText(text, "repeat");
        taskInput.value = "";
    }
});

//Handle password input
password.addEventListener("input", () => {
    if (password.value === avatarConfig.password) {
        startBtn.classList.remove("disabled-button");
        closeBtn.classList.remove("disabled-button");
        return;
    }
    startBtn.classList.add("disabled-button");
    closeBtn.classList.add("disabled-button");
});

//Add taskInput event listener for enter send message
taskInput.addEventListener("keyup", function (event) {
    if (event.keyCode === 13) {
        event.preventDefault();
        talkBtn.click();
    }
});

//on click video open fullscreen
mediaElement.addEventListener("click", () => {
    mediaElement.requestFullscreen();
});

if (password.value !== avatarConfig.password) {
    startBtn.classList.add("disabled-button");
    closeBtn.classList.add("disabled-button");
}

//Load Selects
window.onload = function () {
    loadSelects();
};

function loadSelects() {
    const avatarSelect = document.getElementById("avatarID");
    const voiceSelect = document.getElementById("voiceID");
    let contextCopy = JSON.parse(JSON.stringify(context));

    avatarConfig.avatarList.forEach((avatar) => {
        const option = document.createElement("option");
        option.text = avatar.name;
        option.value = avatar.avatarId;
        avatarSelect.add(option);
    });

    avatarConfig.voiceList.forEach((voice) => {
        const option = document.createElement("option");
        option.text = voice.name;
        option.value = voice.voiceId;
        voiceSelect.add(option);
    });

    avatarConfig.kbContext.forEach((kb) => {
        const option = document.createElement("option");
        option.text = kb.name;
        option.value = kb.context;
        kbID.add(option);
    });

    let systemMessage = {
        role: "system",
        content: [
            {
                type: "text",
                text: kbID.value,
            },
        ],
    };
    contextCopy.push(systemMessage);
    context = contextCopy;
}

// Get session token
async function getSessionToken() {
    const response = await fetch(
        `${avatarConfig.serverUrl}/v1/streaming.create_token`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": avatarConfig.apiKey,
            },
        }
    );

    const data = await response.json();
    sessionToken = data.data.token;
}

// Connect WebSocket
async function connectWebSocket(sessionId) {
    const params = new URLSearchParams({
        session_id: sessionId,
        session_token: sessionToken,
        silence_response: false,
        opening_text: "",
        stt_language: "es",
    });

    const wsUrl = `wss://${
        new URL(avatarConfig.serverUrl).hostname
    }/v1/ws/streaming.chat?${params}`;

    webSocket = new WebSocket(wsUrl);

    // Handle WebSocket events
    webSocket.addEventListener("message", (event) => {
        const eventData = JSON.parse(event.data);
    });
}

async function handleOpenAIService(text) {
    let contextCopy = JSON.parse(JSON.stringify(context));
    let contextObj = {
        role: "user",
        content: [
            {
                type: "text",
                text: text,
            },
        ],
    };
    contextCopy.push(contextObj);

    let modelInstructions = {
        messages: contextCopy,
        temperature: 0.7,
        top_p: 0.95,
        max_tokens: 800,
    };
    console.log(
        "modelInstructions",
        JSON.stringify(modelInstructions, null, 2)
    );

    let config = {
        method: "post",
        maxBodyLength: Infinity,
        url: "https://agentia.openai.azure.com/openai/deployments/agentIA-GPT-4o/chat/completions?api-version=2024-02-15-preview",
        headers: {
            "api-key": "c759d2d3e5be45c691df9936e067e6c9",
            "Content-Type": "application/json",
        },
        data: JSON.stringify(modelInstructions),
    };

    let openAIResponse = await axios(config);
    console.log("openAIResponse", openAIResponse);

    let openAIText = openAIResponse.data.choices[0].message.content;

    contextObj = {
        role: "assistant",
        content: [
            {
                type: "text",
                text: openAIText,
            },
        ],
    };
    console.log("contextObj", contextObj);
    contextCopy.push(contextObj);

    context = contextCopy;
    return openAIText;
}

// Create new session
async function createNewSession() {
    if (!sessionToken) {
        await getSessionToken();
    }

    const response = await fetch(`${avatarConfig.serverUrl}/v1/streaming.new`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
            quality: "high", //"medium"
            knowledge_base_id: "",
            avatar_id: avatarID.value,
            voice: {
                voice_id: voiceID.value,
                rate: 1.0,
                emotion: "Friendly", //Excited, Serious, Friendly, Soothing, Broadcaster
            },
            version: "v2",
            video_encoding: "H264", //"VP8"
            disable_idle_timeout: false, //By default session has a 2 minute idle timeout, setting to true disables it
        }),
    });

    const data = await response.json();
    sessionInfo = data.data;

    // Create LiveKit Room
    room = new LivekitClient.Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
            resolution: LivekitClient.VideoPresets.h720.resolution,
        },
    });

    // Handle room events
    room.on(LivekitClient.RoomEvent.DataReceived, (message) => {
        const data = new TextDecoder().decode(message);
    });

    // Handle media streams
    mediaStream = new MediaStream();
    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === "video" || track.kind === "audio") {
            mediaStream.addTrack(track.mediaStreamTrack);
            if (
                mediaStream.getVideoTracks().length > 0 &&
                mediaStream.getAudioTracks().length > 0
            ) {
                mediaElement.srcObject = mediaStream;
            }
        }
    });

    // Handle media stream removal
    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
        const mediaTrack = track.mediaStreamTrack;
        if (mediaTrack) {
            mediaStream.removeTrack(mediaTrack);
        }
    });

    // Handle room connection state changes
    room.on(LivekitClient.RoomEvent.Disconnected, (reason) => {});

    await room.prepareConnection(sessionInfo.url, sessionInfo.access_token);

    // Connect WebSocket after room preparation
    await connectWebSocket(sessionInfo.session_id);
}

// Start streaming session
async function startStreamingSession() {
    const startResponse = await fetch(
        `${avatarConfig.serverUrl}/v1/streaming.start`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({
                session_id: sessionInfo.session_id,
            }),
        }
    );

    // Connect to LiveKit room
    await room.connect(sessionInfo.url, sessionInfo.access_token);
}

// Send text to avatar
async function sendText(text, taskType = "repeat") {
    if (!sessionInfo) {
        return;
    }

    let openAIResponse = await handleOpenAIService(text, context);

    const response = await fetch(
        `${avatarConfig.serverUrl}/v1/streaming.task`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({
                session_id: sessionInfo.session_id,
                text: openAIResponse,
                task_type: taskType,
            }),
        }
    );
}

// Close session
async function closeSession() {
    if (!sessionInfo) {
        return;
    }

    const response = await fetch(
        `${avatarConfig.serverUrl}/v1/streaming.stop`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({
                session_id: sessionInfo.session_id,
            }),
        }
    );

    // Close WebSocket
    if (webSocket) {
        webSocket.close();
    }
    // Disconnect from LiveKit room
    if (room) {
        room.disconnect();
    }

    mediaElement.srcObject = null;
    sessionInfo = null;
    room = null;
    mediaStream = null;
    sessionToken = null;
    startBtn.classList.remove("disabled-button");
}

//-------- TEXT TO SPEECH --------
// Global variables for audio visualization and speech recognition
let audioContext,
    analyser,
    dataArray,
    bufferLength,
    source,
    animationId,
    mediaStreamSpeech;
let finalTranscript = "";
let recognitionActive = false;
const canvas = document.getElementById("waveform");
const canvasCtx = canvas.getContext("2d");
const transcriptElement = document.getElementById("transcript");
let recognition;

if (!sessionInfo) {
    startVoiceBtn.classList.add("disabled-button");
    talkBtn.classList.add("disabled-button");
}

// Setup Speech Recognition API
try {
    window.SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!window.SpeechRecognition) {
        throw new Error("SpeechRecognition API not supported.");
    }
    recognition = new window.SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "es-ES"; // Change as needed

    recognition.onresult = (event) => {
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + " ";
            } else {
                interimTranscript += transcript;
            }
        }
        transcriptElement.value = finalTranscript + interimTranscript;
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
    };

    recognition.onend = () => {
        recognitionActive = false;
    };
} catch (error) {
    document.getElementById("browser-alert").style.display = "block";
}

// Start/Stop voice recognition and visualization
document.getElementById("start-btn").addEventListener("click", async () => {
    console.log("click start");

    if (!recognitionActive) {
        finalTranscript = "";
        transcriptElement.value = "";
        recognition.start();
        recognitionActive = true;
        document.getElementById("start-btn").innerText = "Detener Voz";
        await startVisualizer();
    } else {
        recognition.stop();
        recognitionActive = false;
        document.getElementById("start-btn").innerText = "Iniciar Voz";
        stopVisualizer();

        // Send the final transcript to the avatar
        sendText(transcriptElement.value, "repeat");
        finalTranscript = "";
        transcriptElement.value = "";
    }
});

// Start the audio visualizer (access microphone, connect analyser, and draw waveform)
async function startVisualizer() {
    try {
        mediaStreamSpeech = await navigator.mediaDevices.getUserMedia({
            audio: true,
        });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        bufferLength = analyser.fftSize;
        dataArray = new Uint8Array(bufferLength);
        source = audioContext.createMediaStreamSource(mediaStreamSpeech);
        source.connect(analyser);
        drawWaveform();
    } catch (err) {
        console.log("err", err);
    }
}

// Stop the visualizer and clean up resources
function stopVisualizer() {
    if (animationId) cancelAnimationFrame(animationId);
    if (source) source.disconnect();
    if (analyser) analyser.disconnect();
    if (audioContext) audioContext.close();
    if (mediaStreamSpeech)
        mediaStreamSpeech.getTracks().forEach((track) => track.stop());
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawWaveform() {
    // Call this function continuously so the waveform animates in real-time
    animationId = requestAnimationFrame(drawWaveform);

    // Get the latest time-domain audio data
    analyser.getByteTimeDomainData(dataArray);

    // Clear the canvas
    canvasCtx.fillStyle = "#f5f5f5"; // background color
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    // You can play with barWidth to match the desired style
    const barWidth = (canvas.width / bufferLength) * 2;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        // Convert the data from [0..255] range to roughly [-1..1]
        const v = (dataArray[i] - 128) / 128.0;
        // Height of each bar is based on absolute amplitude
        const barHeight = Math.abs(v) * (canvas.height / 2);

        // Center each bar around the canvas midline
        const y = canvas.height / 2 - barHeight;

        // Draw the bar
        canvasCtx.fillStyle = "#007bff"; // waveform color
        canvasCtx.fillRect(x, y, barWidth, barHeight * 2);

        // Add some spacing between bars (increase or decrease to taste)
        x += barWidth + 1;
    }
}
