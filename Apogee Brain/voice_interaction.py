import speech_recognition as sr
import pyttsx3
import os

recognizer = sr.Recognizer()
tts_engine = pyttsx3.init()

DATA_PATH = r"C:\Users\kewot\OneDrive\Desktop\Dan\Apogee SKOPE LLP\ApogeeBrainData\voice_logs.txt"

def speak(text):
    print(f"Apogee Brain: {text}")
    tts_engine.say(text)
    tts_engine.runAndWait()

def listen():
    with sr.Microphone() as source:
        print("Listening...")
        audio = recognizer.listen(source)
        try:
            command = recognizer.recognize_google(audio)
            print(f"You said: {command}")
            return command.lower()
        except:
            return ""

def main():
    speak("Voice interaction ready. Say 'Apogee' to wake me up.")
    session_log = ""
    while True:
        command = listen()
        if "apogee" in command:
            speak("Yes, Daniel?")
            user_text = listen()
            if "email" in user_text:
                with open(r"C:\Users\kewot\OneDrive\Desktop\Dan\Apogee SKOPE LLP\ApogeeBrainData\gmail_output.md", "r", encoding="utf-8") as f:
                    response = f.read()
                speak(response)
                session_log = f"You: {user_text}\nApogee Brain: {response}\n"
            elif "calendar" in user_text:
                with open(r"C:\Users\kewot\OneDrive\Desktop\Dan\Apogee SKOPE LLP\ApogeeBrainData\calendar_output.md", "r", encoding="utf-8") as f:
                    response = f.read()
                speak(response)
                session_log = f"You: {user_text}\nApogee Brain: {response}\n"
            elif "exit" in user_text:
                speak("Goodbye, Daniel.")
                break
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        f.write(session_log)

if __name__ == "__main__":
    main()
