let audioContext;
let analyser;
let dataArray;
let bufferLength;
let source;
let animationId;
let mediaStream;
let mediaRecorder;
let recordedChunks = [];
let finalTranscript = "";
let recognitionActive = false;
const canvas = document.getElementById("waveform");
const canvasCtx = canvas.getContext("2d");
const transcriptElement = document.getElementById("transcript");
let audioDuration = 0;
let audioBase64 = "";

// Variables to store recording times
let recordingStartTime = null;
let recordingEndTime = null;

// Disable save and reset buttons
let saveButton = document.getElementById("save-btn");
let resetButton = document.getElementById("reset-btn");
saveButton.disabled = true;
resetButton.disabled = true;
saveButton.classList.add("disabled-button");
resetButton.classList.add("disabled-button");

try {
    // Check for the browser-specific implementations
    window.SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!window.SpeechRecognition) {
        throw new Error("SpeechRecognition API not supported in this browser.");
    }

    // Create an instance of SpeechRecognition
    const recognition = new window.SpeechRecognition();

    // Set the recognition parameters
    recognition.continuous = true; // Keep listening until stopped
    recognition.interimResults = true; // Show interim results
    recognition.lang = "es-ES"; // Language (change as needed)

    // Event handler for when the recognition produces a result
    recognition.onresult = (event) => {
        let interimTranscript = "";

        // Loop through the results from the event
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + " ";
            } else {
                interimTranscript += transcript;
            }
        }

        // Update the transcript element with the combined final and interim transcripts
        transcriptElement.value = finalTranscript + interimTranscript;

        // Adjust the textarea height
        adjustTranscriptTextareaHeight();
    };

    // Error handling for the recognition process
    recognition.onerror = (event) => {
        console.error("Speech recognition error detected: " + event.error);
    };

    recognition.onend = () => {
        recognitionActive = false;
    };

    // Start and stop the recognition and visualization based on button clicks
    document.getElementById("start-btn").addEventListener("click", async () => {
        if (!recognitionActive) {
            recognition.start();
            recognitionActive = true;
        }

        // Disable save and reset buttons
        saveButton.disabled = true;
        resetButton.disabled = true;
        saveButton.classList.add("disabled-button");
        resetButton.classList.add("disabled-button");
        resetApp();

        // Enable stop button
        document.getElementById("stop-btn").disabled = false;
        document.getElementById("stop-btn").classList.remove("disabled-button");

        // Set transcript textarea to read-only during recording
        transcriptElement.readOnly = true;

        // Record the start time
        recordingStartTime = Date.now();

        await startVisualizer();
    });

    document.getElementById("stop-btn").addEventListener("click", () => {
        if (recognitionActive) {
            recognition.stop();
            recognitionActive = false;
        }

        // Record the end time
        recordingEndTime = Date.now();

        // Calculate the duration
        let durationInMilliseconds = recordingEndTime - recordingStartTime;
        audioDuration = Math.floor(durationInMilliseconds / 1000);

        // Enable save and reset buttons
        saveButton.disabled = false;
        resetButton.disabled = false;
        saveButton.classList.remove("disabled-button");
        resetButton.classList.remove("disabled-button");
        stopVisualizer();

        // Disable stop button
        document.getElementById("stop-btn").disabled = true;
        document.getElementById("stop-btn").classList.add("disabled-button");

        // Make transcript textarea editable again
        transcriptElement.readOnly = false;
    });

    // Reset button event listener
    document.getElementById("reset-btn").addEventListener("click", () => {
        resetApp();
    });

    // Add event listener for the transcript textarea to handle user input
    transcriptElement.addEventListener("input", handleTranscriptInput);
} catch (error) {
    // Handle errors (e.g., SpeechRecognition not supported)
    // Show the Bootstrap alert
    const alertElement = document.getElementById("browser-alert");
    alertElement.style.display = "block";

    // Disable add button
    document.getElementById("btnAddAudio").disabled = true;
    document.getElementById("btnAddAudio").classList.add("disabled-button");

    // Disable the start, stop, and reset buttons
    document.getElementById("start-btn").disabled = true;
    document.getElementById("stop-btn").disabled = true;
    document.getElementById("reset-btn").disabled = true;
}

// Function to start the audio visualizer and recording
async function startVisualizer() {
    try {
        // Get the user's microphone input
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
        });

        // Create an AudioContext
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Create an analyser node
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;

        bufferLength = analyser.fftSize;
        dataArray = new Uint8Array(bufferLength);

        // Create a media stream source from the microphone input
        source = audioContext.createMediaStreamSource(mediaStream);

        // Connect the source to the analyser
        source.connect(analyser);

        // Start drawing the waveform
        drawWaveform();

        // Initialize MediaRecorder to record audio
        recordedChunks = [];

        // Use default MIME type for better compatibility
        mediaRecorder = new MediaRecorder(mediaStream);

        mediaRecorder.ondataavailable = function (e) {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = function (e) {
            // Process recordedChunks to create Blob
            let blob = new Blob(recordedChunks, {
                type: mediaRecorder.mimeType,
            });

            // Convert Blob to Base64
            let reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = function () {
                audioBase64 = reader.result.split(",")[1];
            };

            // Create audio element to play back the recorded audio
            let audioURL = URL.createObjectURL(blob);
            let audioElement = document.createElement("audio");
            audioElement.controls = true;
            audioElement.src = audioURL;
            audioElement.type = mediaRecorder.mimeType;
            audioElement.id = "recorded-audio";

            // Append audio element to playback container
            const playbackContainer = document.getElementById("audio-playback");
            playbackContainer.innerHTML = ""; // Clear previous content
            playbackContainer.appendChild(audioElement);
        };

        // Start recording
        mediaRecorder.start();
    } catch (err) {
        console.error("Error accessing microphone for visualization:", err);
        alert(
            "Could not access the microphone. Please allow microphone access."
        );
    }
}

// Function to stop the audio visualizer and recording
function stopVisualizer() {
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    if (source) {
        source.disconnect();
    }
    if (analyser) {
        analyser.disconnect();
    }
    if (audioContext) {
        audioContext.close();
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
    }
    // Stop the media recorder
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    // Clear the canvas
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
}

// Function to reset the app
function resetApp() {
    stopVisualizer();

    // Clear transcripts
    transcriptElement.value = "";
    finalTranscript = "";

    // Clear audio playback
    const playbackContainer = document.getElementById("audio-playback");
    playbackContainer.innerHTML = "";

    // Reset variables
    recordedChunks = [];
    mediaRecorder = null;
    mediaStream = null;
    audioContext = null;
    analyser = null;
    source = null;
    audioDuration = 0;
    audioBase64 = "";
    recordingStartTime = null;
    recordingEndTime = null;

    // Disable save and reset buttons
    saveButton.disabled = true;
    resetButton.disabled = true;
    saveButton.classList.add("disabled-button");
    resetButton.classList.add("disabled-button");

    // Disable stop button
    document.getElementById("stop-btn").disabled = true;
    document.getElementById("stop-btn").classList.add("disabled-button");

    // Clear the canvas
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
}

// Function to draw the waveform on the canvas
function drawWaveform() {
    animationId = requestAnimationFrame(drawWaveform);

    analyser.getByteTimeDomainData(dataArray);

    canvasCtx.fillStyle = "#f5f5f5";
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = "#007bff";

    canvasCtx.beginPath();

    const sliceWidth = canvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0; // Normalize between 0 and 1
        const y = (v * canvas.height) / 2;

        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
}

// Function to adjust the textarea height automatically
function adjustTranscriptTextareaHeight() {
    // Reset the height to auto to get the correct scrollHeight
    transcriptElement.style.height = "auto";
    // Set the height to the scrollHeight
    transcriptElement.style.height = transcriptElement.scrollHeight + "px";
}

// Function to handle user input in the transcript textarea
function handleTranscriptInput(event) {
    finalTranscript = event.target.value;
    // Adjust the textarea height
    adjustTranscriptTextareaHeight();
}

async function saveAudioToBlob() {
    // Ask confirmation
    let askConfirm = await Swal.fire({
        title: "¿Estás seguro de que deseas guardar el audio?",
        showDenyButton: true,
        confirmButtonText: "Si",
        denyButtonText: `No`,
        confirmButtonColor: "#27315d",
        denyButtonColor: "#27315d",
    });
    // Cancelamos el guardado de cambios
    if (askConfirm.isDenied || askConfirm.isDismissed) {
        return;
    }

    try {
        // Create name with date and time
        let fileName =
            new Date()
                .toLocaleString("en-GB")
                .replace(",", "")
                .replaceAll("/", "-")
                .replaceAll(":", "-") + " DEMO Conversation Studio.webm";
        let data = {
            audio: audioBase64,
            type: "audio/webm",
            name: fileName,
            transcript: finalTranscript,
            duration: audioDuration,
        };

        // Close modal
        $("#exampleModal").modal("hide");

        // Loading modal
        Swal.fire({
            title: "Conectando con el servicio...",
            html: `
                <div id="InProgressIcon" class="spinner-border text-primary" role="status">
                    <span class="sr-only">Loading...</span>
                </div>
                <div id="InProgressText" class="text-primary">Guardando audio...</div>
                `,
            allowOutsideClick: false,
            showConfirmButton: false,
        });

        // Send data to server
        let res = await axios({
            method: "POST",
            url: "https://intevolution-functionapp-conversationsdemo.azurewebsites.net/api/ConversationAnalysis?code=AHPqZ0HHDvHS0b8qm2Bd0AwtFX70Mi0lNj0YlT0dV7COAzFu8u3mhw%3D%3D&type=UploadAudio",
            data: data,
            Headers: {
                "Content-Type": "application/json",
            },
        });

        // Close loading modal
        Swal.close();
        let responseCode = res.data.response.code;

        switch (responseCode) {
            case "00":
                Swal.fire({
                    icon: "success",
                    title: "¡Guardado exitoso!",
                    text: "El audio ha sido guardado correctamente.",
                });

                //Click refresh button
                document.getElementById("btnRefreshAudio").click();
                break;

            default:
                Swal.fire({
                    icon: "error",
                    title: "No se pudo conectar al servicio",
                    text: "Ha ocurrido un error al guardar el audio.",
                });

                break;
        }
    } catch (error) {
        Swal.fire({
            icon: "error",
            title: "No se pudo conectar al servicio",
            text: "Ha ocurrido un error al guardar el audio.",
        });
        console.error("Error saving audio to blob:", error);
    }
}
