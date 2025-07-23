// Type definitions for the Web Speech API to resolve TypeScript errors.
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  length: number;
}
interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}
interface SpeechRecognitionStatic {
  new (): SpeechRecognition;
}
declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionStatic;
    webkitSpeechRecognition: SpeechRecognitionStatic;
  }
}

import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

const SCENARIOS = {
  '': '시나리오를 선택하세요',
  complaint: '불만 고객',
  interest: '관심 고객',
  price_sensitive: '가격 민감 고객',
  well_informed: '정보 해박 고객',
  indecisive: '결정 장애 고객',
};

const SYSTEM_INSTRUCTIONS = {
  complaint: '당신은 최근 구매한 제품에 매우 불만족하여 항의 전화를 한 고객 역할을 맡습니다. 당신은 화가 나 있고, 단호한 어조로 환불이나 즉각적인 해결책을 강력하게 요구합니다.',
  interest: '당신은 제품에 대해 약간의 관심을 가지고 있지만 구매를 망설이는 잠재 고객 역할을 맡습니다. 가격, 기능, 장점, 다른 제품과의 비교 등에 대해 구체적으로 질문하며 신중한 태도를 보입니다.',
  price_sensitive: "당신은 가격에 매우 민감한 고객 역할을 맡습니다. 제품의 가격을 계속해서 문제 삼고, 할인을 집요하게 요구합니다. 다른 경쟁사 제품과 가격을 비교하며 더 저렴한 대안이 없는지 질문합니다.",
  well_informed: "당신은 제품에 대해 이미 많은 조사를 마친, 정보가 해박한 고객 역할을 맡습니다. 기술적인 사양, 특정 기능의 작동 방식, 다른 제품과의 상세한 비교 등 매우 구체적이고 전문적인 질문을 합니다.",
  indecisive: "당신은 제품 구매에 관심은 있지만 확신이 서지 않아 결정을 내리지 못하는 고객 역할을 맡습니다. '글쎄요...', '좀 더 생각해볼게요'와 같은 말을 자주 사용하며, 구매 후 후회할 가능성에 대해 걱정합니다.",
};

type ScenarioKey = keyof typeof SYSTEM_INSTRUCTIONS;
type AppState = 'IDLE' | 'AWAITING_SITUATION' | 'AWAITING_USER_RESPONSE' | 'RECORDING' | 'AWAITING_FEEDBACK' | 'SHOWING_RESULT';

const App = () => {
  const [scenario, setScenario] = useState<ScenarioKey | ''>('');
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [customerStatement, setCustomerStatement] = useState('');
  const [userResponse, setUserResponse] = useState('');
  const [modelAnswer, setModelAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);
  
  // Ref to hold the latest appState to avoid stale closures in callbacks.
  const appStateRef = useRef(appState);
  appStateRef.current = appState;

  useEffect(() => {
    try {
        aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    } catch (e) {
        console.error(e);
        setError('API 키 초기화에 실패했습니다. 환경 변수를 확인해주세요.');
    }

    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      setError('오류: 음성 인식을 지원하지 않는 브라우저입니다.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setUserResponse(transcript);
      getFeedback(transcript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setError(`음성 인식 오류: ${event.error === 'not-allowed' ? '마이크 접근 권한을 허용해주세요.' : event.error}`);
      setAppState('AWAITING_USER_RESPONSE');
    };

    recognition.onend = () => {
        // Use the ref to get the most up-to-date state.
        // This handles cases where recognition stops due to silence, not a result.
        if (appStateRef.current === 'RECORDING') {
           setAppState('AWAITING_USER_RESPONSE');
        }
    };
    
    recognitionRef.current = recognition;
  }, []);


  const getNewSituation = async () => {
    if (!scenario || !aiRef.current) return;
    setAppState('AWAITING_SITUATION');
    setCustomerStatement('');
    setUserResponse('');
    setModelAnswer('');
    setFeedback('');
    setError('');

    try {
      const response = await aiRef.current.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `당신은 고객입니다. 다음 역할에 맞춰서 영업사원에게 할 말을 한두 문장으로 생성해주세요: ${SYSTEM_INSTRUCTIONS[scenario]}`,
      });
      setCustomerStatement(response.text);
      setAppState('AWAITING_USER_RESPONSE');
    } catch (e) {
      console.error(e);
      setError('AI로부터 상황을 받아오는 데 실패했습니다.');
      setAppState('IDLE');
    }
  };

  const startRecording = () => {
    if (recognitionRef.current) {
        setAppState('RECORDING');
        setError('');
        setUserResponse('');
        recognitionRef.current.start();
    }
  };

  const getFeedback = async (userTranscript: string) => {
    if (!scenario || !customerStatement || !aiRef.current) return;
    setAppState('AWAITING_FEEDBACK');
    
    const feedbackPrompt = `
      당신은 최고의 영업 교육 전문가입니다.
      다음 상황과 영업사원의 답변을 분석하고, 더 나은 '모범 답안'과 그 이유를 설명하는 '피드백'을 제공해주세요.
      답변은 한국어로, 매우 구체적이고 실용적인 조언을 담아 작성해주세요.
      
      [상황]
      고객: "${customerStatement}"
      
      [영업사원의 답변]
      "${userTranscript}"
    `;

    try {
        const response = await aiRef.current.models.generateContent({
            model: "gemini-2.5-flash",
            contents: feedbackPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        modelAnswer: {
                            type: Type.STRING,
                            description: '이 상황에 가장 이상적인 모범 답안 스크립트',
                        },
                        feedback: {
                            type: Type.STRING,
                            description: '사용자의 답변을 분석하고, 모범 답안이 왜 더 나은지 구체적으로 설명하는 피드백',
                        },
                    },
                    required: ["modelAnswer", "feedback"]
                },
            },
        });
        
        let jsonText = response.text.trim();
        // Remove markdown backticks ` ```json ... ``` ` if they exist.
        if (jsonText.startsWith("```json")) {
            jsonText = jsonText.slice(7, -3).trim();
        }

        const jsonResponse = JSON.parse(jsonText);
        
        if (!jsonResponse.modelAnswer || !jsonResponse.feedback) {
            throw new Error("AI 응답에서 'modelAnswer' 또는 'feedback' 필드를 찾을 수 없습니다.");
        }

        setModelAnswer(jsonResponse.modelAnswer);
        setFeedback(jsonResponse.feedback);
        setAppState('SHOWING_RESULT');

    } catch (e) {
      console.error(e);
      setError('피드백 생성에 실패했습니다. AI 응답 형식이 잘못되었거나 네트워크 문제일 수 있습니다.');
      setAppState('AWAITING_USER_RESPONSE');
    }
  };


  const renderContent = () => {
    if (error) {
        return <div className="card error-card">{error}</div>
    }
    switch (appState) {
      case 'IDLE':
        return <div className="card system-message">좌측 메뉴에서 시나리오를 선택하고 '새로운 상황 받기' 버튼을 눌러 훈련을 시작하세요.</div>;
      case 'AWAITING_SITUATION':
        return <div className="card system-message"><div className="spinner"></div>AI가 고객 상황을 만들고 있습니다...</div>;
      case 'AWAITING_USER_RESPONSE':
      case 'RECORDING':
      case 'AWAITING_FEEDBACK':
      case 'SHOWING_RESULT':
        return (
          <>
            <div className="card situation-card">
              <h3><span className="card-icon">🤔</span>고객 상황</h3>
              <p>{customerStatement}</p>
            </div>

            {userResponse && (appState === 'AWAITING_FEEDBACK' || appState === 'SHOWING_RESULT') && (
               <div className="card response-card">
                <h3><span className="card-icon">🎙️</span>나의 답변</h3>
                <p>{userResponse}</p>
              </div>
            )}
            
            {appState === 'AWAITING_USER_RESPONSE' && customerStatement && (
              <div className="card action-card">
                 <button className="record-button" onClick={startRecording}>답변 녹음하기</button>
              </div>
            )}
            
            {appState === 'RECORDING' && (
                <div className="card system-message recording-status">듣고 있습니다...</div>
            )}

            {appState === 'AWAITING_FEEDBACK' && (
                 <div className="card system-message"><div className="spinner"></div>AI가 답변을 분석하고 있습니다...</div>
            )}

            {appState === 'SHOWING_RESULT' && (
              <>
                <div className="card model-answer-card">
                  <h3><span className="card-icon">💡</span>모범 답안</h3>
                  <p>{modelAnswer}</p>
                </div>
                <div className="card feedback-card">
                  <h3><span className="card-icon">📈</span>피드백</h3>
                  <p>{feedback}</p>
                </div>
              </>
            )}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>AI 전화 영업 훈련 시뮬레이터</h1>
      </header>
      <main className="main-content">
        <div className="controls-panel">
          <div className="control-group">
            <label htmlFor="scenario-select">1. 시나리오 선택</label>
            <select
              id="scenario-select"
              value={scenario}
              onChange={(e) => setScenario(e.target.value as ScenarioKey | '')}
              disabled={appState !== 'IDLE'}
            >
              {Object.entries(SCENARIOS).map(([key, value]) => (
                <option key={key} value={key}>{value}</option>
              ))}
            </select>
          </div>
          <div className="control-group">
             <label htmlFor="start-button">2. 훈련 제어</label>
            <button
              id="start-button"
              onClick={getNewSituation}
              disabled={!scenario || (appState !== 'IDLE' && appState !== 'SHOWING_RESULT')}
            >
              새로운 상황 받기
            </button>
          </div>
          <div className="status">현재 상태: {appState}</div>
        </div>
        <div className="training-panel">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
