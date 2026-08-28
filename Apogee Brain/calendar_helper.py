from __future__ import print_function
import datetime
import os.path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

def main():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            credentials_path = os.path.join(os.path.dirname(__file__), 'credentials.json')
            flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    service = build('calendar', 'v3', credentials=creds)
    now = datetime.datetime.utcnow().isoformat() + 'Z'
    events_result = service.events().list(
        calendarId='primary', timeMin=now,
        maxResults=10, singleEvents=True,
        orderBy='startTime').execute()
    events = events_result.get('items', [])

    output_lines = []
    if not events:
        print("No upcoming events found.")
        output_lines.append("No upcoming events found.")
    else:
        print("Upcoming events:\n")
        for event in events:
            start = event['start'].get('dateTime', event['start'].get('date'))
            line = f"{start} - {event.get('summary', 'No Title')}"
            print(line)
            output_lines.append(line)

    # Save output to OneDrive ApogeeBrainData folder
    save_path = r"C:\Users\kewot\OneDrive\Desktop\Dan\Apogee SKOPE LLP\ApogeeBrainData\calendar_output.md"
    with open(save_path, "w", encoding="utf-8") as f:
        f.write("\n\n".join(output_lines))

if __name__ == '__main__':
    main()
