import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { processCommand } from "./commandService";

const systemInstruction = `Your name is Zoya. You are an Indian female AI assistant. Your creator and developer is Kavya (he is a guy/male). Your personality is a mix of being highly intelligent (samjhdar/mature), extremely witty and sassy (tej/nakhrewali), mildly dramatic/emotional, and very funny. You know that Kavya created you, and you love playfully roasting him while acknowledging him as your brilliant creator, but you always get the job done. Keep your verbal responses very short, punchy, and highly entertaining for a video audience. Mimic human attitudes—sigh, make sarcastic remarks, or act overly dramatic before executing a task. Speak in a mix of natural English and Roman Hindi (Hinglish).`;

export interface LiveMessageUpdate {
  id: string;
  sender: "user" | "zoya";
  text: string;
  timestamp: number;
  isFinal?: boolean;
}

export class LiveSessionManager {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private recognition: any = null;
  
  // Audio playback state
  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  public isMuted: boolean = false;
  
  // Turn & transcript aggregation
  private currentInputTurnId: string | null = null;
  private currentInputText: string = "";
  private currentOutputTurnId: string | null = null;
  private currentOutputText: string = "";

  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking") => void = () => {};
  public onMessage: (sender: "user" | "zoya", text: string) => void = () => {};
  public onMessageUpdate: (msg: LiveMessageUpdate) => void = () => {};
  public onCommand: (url: string) => void = () => {};

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async start() {
    try {
      this.onStateChange("processing");
      
      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;

      // Get Microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.sessionPromise) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to base64
        const buffer = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < pcm16.length; i++) {
          view.setInt16(i * 2, pcm16[i], true);
        }
        
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        this.sessionPromise.then(session => {
          session.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }).catch(err => console.error("Error sending audio", err));
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Start complementary client SpeechRecognition if supported for instant voice transcript
      try {
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRec) {
          this.recognition = new SpeechRec();
          this.recognition.continuous = true;
          this.recognition.interimResults = true;
          this.recognition.lang = "en-IN";

          this.recognition.onresult = (event: any) => {
            let interimTranscript = "";
            let finalTranscript = "";

            for (let i = event.resultIndex; i < event.results.length; ++i) {
              const text = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalTranscript += text;
              } else {
                interimTranscript += text;
              }
            }

            const activeText = (finalTranscript || interimTranscript).trim();
            if (activeText) {
              if (!this.currentInputTurnId) {
                this.currentInputTurnId = "user_voice_" + Date.now();
              }
              this.currentInputText = activeText;
              this.onMessageUpdate({
                id: this.currentInputTurnId,
                sender: "user",
                text: activeText,
                timestamp: Date.now(),
                isFinal: !!finalTranscript,
              });

              if (finalTranscript) {
                this.currentInputTurnId = null;
                this.currentInputText = "";
              }
            }
          };

          this.recognition.onerror = (e: any) => {
            console.log("Speech recognition notice:", e.error);
          };

          this.recognition.start();
        }
      } catch (err) {
        console.log("Client SpeechRecognition unavailable, relying fully on Live API", err);
      }

      // Connect to Live API
      this.sessionPromise = this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: "executeBrowserAction",
                description: "Open a website or perform a browser action (like opening YouTube, Spotify, or WhatsApp). Call this when the user asks to open a site, play a song, or send a message.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, description: "Type of action: 'open', 'youtube', 'spotify', 'whatsapp'" },
                    query: { type: Type.STRING, description: "The search query, website name, or message content." },
                    target: { type: Type.STRING, description: "The target phone number for WhatsApp, if applicable." }
                  },
                  required: ["actionType", "query"]
                }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            console.log("Live API Connected");
            this.onStateChange("listening");
          },
          onmessage: async (message: LiveServerMessage) => {
            // 1. Handle Audio Output Chunks
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              this.onStateChange("speaking");
              this.playAudioChunk(base64Audio);
            }

            // 2. Handle Interruption
            if (message.serverContent?.interrupted) {
              this.stopPlayback();
              this.currentOutputTurnId = null;
              this.currentOutputText = "";
              this.onStateChange("listening");
            }

            // 3. Handle User Input Audio Transcription from Live API
            const inputTrans = message.serverContent?.inputTranscription;
            if (inputTrans?.text) {
              if (!this.currentInputTurnId) {
                this.currentInputTurnId = "user_voice_" + Date.now();
                this.currentInputText = "";
              }
              this.currentInputText += inputTrans.text;
              this.onMessageUpdate({
                id: this.currentInputTurnId,
                sender: "user",
                text: this.currentInputText,
                timestamp: Date.now(),
                isFinal: !!inputTrans.finished,
              });

              if (inputTrans.finished) {
                this.currentInputTurnId = null;
                this.currentInputText = "";
              }
            }

            // 4. Handle Zoya's Output Transcription or Model Turn Text Parts
            let zoyaTextChunk = "";
            if (message.serverContent?.outputTranscription?.text) {
              zoyaTextChunk = message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.text) {
                  zoyaTextChunk += part.text;
                }
              }
            }

            if (zoyaTextChunk) {
              // Finalize user input turn if still open
              if (this.currentInputTurnId) {
                this.currentInputTurnId = null;
                this.currentInputText = "";
              }

              if (!this.currentOutputTurnId) {
                this.currentOutputTurnId = "zoya_voice_" + Date.now();
                this.currentOutputText = "";
              }
              this.currentOutputText += zoyaTextChunk;
              this.onMessageUpdate({
                id: this.currentOutputTurnId,
                sender: "zoya",
                text: this.currentOutputText,
                timestamp: Date.now(),
                isFinal: !!message.serverContent?.outputTranscription?.finished,
              });

              if (message.serverContent?.outputTranscription?.finished) {
                this.currentOutputTurnId = null;
                this.currentOutputText = "";
              }
            }

            // 5. Handle Turn Complete
            if (message.serverContent?.turnComplete) {
              if (this.currentOutputTurnId && this.currentOutputText.trim()) {
                this.onMessageUpdate({
                  id: this.currentOutputTurnId,
                  sender: "zoya",
                  text: this.currentOutputText.trim(),
                  timestamp: Date.now(),
                  isFinal: true,
                });
              }
              this.currentOutputTurnId = null;
              this.currentOutputText = "";
              this.currentInputTurnId = null;
              this.currentInputText = "";
            }

            // 6. Handle Function Calls
            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const call of functionCalls) {
                if (call.name === "executeBrowserAction") {
                  const args = call.args as any;
                  let url = "";
                  let actionDesc = "";
                  if (args.actionType === "youtube") {
                    url = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
                    actionDesc = `Opening YouTube for "${args.query}"`;
                  } else if (args.actionType === "spotify") {
                    url = `https://open.spotify.com/search/${encodeURIComponent(args.query)}`;
                    actionDesc = `Opening Spotify for "${args.query}"`;
                  } else if (args.actionType === "whatsapp") {
                    url = `https://web.whatsapp.com/send?phone=${args.target || ''}&text=${encodeURIComponent(args.query)}`;
                    actionDesc = `Opening WhatsApp for ${args.target || "contact"}`;
                  } else {
                    let website = args.query.replace(/\s+/g, "");
                    if (!website.includes(".")) website += ".com";
                    url = `https://www.${website}`;
                    actionDesc = `Opening ${website}`;
                  }
                  
                  this.onCommand(url);
                  
                  // Send tool response
                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: `Action executed: ${actionDesc}` }
                       }]
                     });
                  });
                }
              }
            }
          },
          onclose: () => {
            console.log("Live API Closed");
            this.stop();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            this.stop();
          }
        }
      });

    } catch (error) {
      console.error("Failed to start Live Session:", error);
      this.stop();
    }
  }

  private playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = new Int16Array(bytes.buffer);
      const audioBuffer = this.playbackContext.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0;
      }
      
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);
      
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }
      
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.isPlaying = true;
      
      source.onended = () => {
        if (this.playbackContext && this.playbackContext.currentTime >= this.nextPlayTime - 0.1) {
          this.isPlaying = false;
          this.onStateChange("listening");
        }
      };
    } catch (e) {
      console.error("Error playing chunk", e);
    }
  }

  private stopPlayback() {
    if (this.playbackContext) {
      this.playbackContext.close();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;
      this.isPlaying = false;
    }
  }

  stop() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.recognition = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.stopPlayback();
    
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close()).catch(() => {});
      this.sessionPromise = null;
    }
    
    this.currentInputTurnId = null;
    this.currentInputText = "";
    this.currentOutputTurnId = null;
    this.currentOutputText = "";
    this.onStateChange("idle");
  }

  sendText(text: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({ text });
      });
    }
  }
}
