// Vercel Serverless Function
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { category, menu, manualData } = req.body;
    
    if (!category || !menu) {
      return res.status(400).json({ error: '필수 파라미터 누락' });
    }
    
    // Gemini API 호출
    const API_KEY = process.env.GEMINI_API_KEY;
    
    if (!API_KEY) {
      return res.status(500).json({ error: 'API 키가 설정되지 않았습니다' });
    }
    
    const prompt = `당신은 제주특별자치도 자치경찰 업무 전문가입니다.

업무 분야: ${category}
업무 항목: ${menu}

${manualData ? '기존 매뉴얼 참고:\n법적정의: ' + manualData.legal + '\n업무사례: ' + manualData.cases : ''}

다음 JSON 형식으로만 응답하세요. 마크다운 없이 순수 JSON만:

{
  "legal": "관련 법령과 법적 정의를 3-5문장으로 설명",
  "cases": "실제 업무 사례 2-3개를 상황-대응-결과 형식으로",
  "checklist": "단계별 처리 체크리스트 5-8개 항목 (번호 포함)",
  "aiAnalysis": "주의사항과 실무 팁 3-5개 (• 기호 포함)"
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });
    
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API 오류:', errorText);
      throw new Error('Gemini API 호출 실패');
    }
    
    const geminiData = await geminiResponse.json();
    
    if (!geminiData.candidates || !geminiData.candidates[0]) {
      throw new Error('Gemini 응답 없음');
    }
    
    let text = geminiData.candidates[0].content.parts[0].text.trim();
    
    // JSON 정리
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    // JSON 파싱
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        result = JSON.parse(match[0]);
      } else {
        throw new Error('JSON 파싱 실패');
      }
    }
    
    // 필수 필드 확인
    if (!result.legal || !result.cases || !result.checklist || !result.aiAnalysis) {
      throw new Error('필수 필드 누락');
    }
    
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('서버 오류:', error);
    return res.status(500).json({ 
      error: error.message || '서버 오류 발생' 
    });
  }
}
