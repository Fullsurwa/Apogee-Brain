from __future__ import print_function
import os.path
import base64
import html
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

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

    service = build('gmail', 'v1', credentials=creds)
    results = service.users().messages().list(userId='me', maxResults=10).execute()
    messages = results.get('messages', [])

    output_lines = []
    if not messages:
        print("No messages found.")
        output_lines.append("No messages found.")
    else:
        print("Latest messages:\n")
        for msg in messages:
            msg_data = service.users().messages().get(userId='me', id=msg['id']).execute()
            snippet = msg_data.get('snippet', '')
            decoded_snippet = html.unescape(snippet)
            print(decoded_snippet)
            output_lines.append(decoded_snippet)

    # Save output to OneDrive ApogeeBrainData folder
    save_path = r"C:\Users\kewot\OneDrive\Desktop\Dan\Apogee SKOPE LLP\ApogeeBrainData\gmail_output.md"
    with open(save_path, "w", encoding="utf-8") as f:
        f.write("\n\n".join(output_lines))

if __name__ == '__main__':
    main()
