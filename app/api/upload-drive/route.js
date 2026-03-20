import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { Readable } from 'stream';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: '업로드된 파일이 없습니다.' }, { status: 400 });
    }

    // 파일을 컴퓨터가 읽을 수 있는 물줄기(Stream)로 변환
    const buffer = Buffer.from(await file.arrayBuffer());
    const stream = Readable.from(buffer);

    // 구글 로봇 신분증으로 로그인
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // 구글 드라이브 폴더에 파일 업로드 (권한은 폴더 설정을 자동 상속받음)
    const response = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      },
      media: {
        mimeType: file.type,
        body: stream,
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true, 
    });

    // 성공 시 드라이브 주소 반환
    return NextResponse.json({
      success: true,
      url: response.data.webViewLink,
    });

  } catch (error) {
    console.error('구글 드라이브 업로드 에러:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}