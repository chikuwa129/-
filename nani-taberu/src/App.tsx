import { useState } from 'react';
import dishesJson from './data/dishes.json';
import type { Dish } from './logic/types';
import type { ParsedInput } from './logic/freeText';
import {
  answerQuestion,
  applyAnswers,
  createSession,
  excludeDish,
  isFinished,
  skipQuestion,
  type SessionState,
} from './logic/engine';
import { dictionaryInterpreter } from './logic/interpreter';
import StartScreen from './screens/StartScreen';
import FreeInputScreen from './screens/FreeInputScreen';
import QuestionScreen from './screens/QuestionScreen';
import ResultScreen from './screens/ResultScreen';

const dishes = dishesJson as Dish[];

type Screen = 'start' | 'free' | 'question' | 'result';

export default function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [session, setSession] = useState<SessionState>(() => createSession(dishes));
  const [freeTags, setFreeTags] = useState<ParsedInput['tags']>([]);

  /** 状態を更新し、終了条件を満たしていれば結果画面へ */
  const proceed = (next: SessionState) => {
    setSession(next);
    setScreen(isFinished(dishes, next) ? 'result' : 'question');
  };

  const startAkinator = () => {
    setFreeTags([]);
    proceed(createSession(dishes));
  };

  const restart = () => {
    setFreeTags([]);
    setSession(createSession(dishes));
    setScreen('start');
  };

  /** 解釈できたら true。入力文そのものはここで捨てる（保存しない） */
  const submitFreeText = async (text: string): Promise<boolean> => {
    const parsed = await dictionaryInterpreter.interpret(text);
    if (parsed.answers.length === 0) return false;
    setFreeTags(parsed.tags);
    proceed(applyAnswers(createSession(dishes), parsed.answers));
    return true;
  };

  switch (screen) {
    case 'start':
      return <StartScreen onAkinator={startAkinator} onFree={() => setScreen('free')} />;
    case 'free':
      return <FreeInputScreen onSubmit={submitFreeText} onAkinator={startAkinator} onBack={restart} />;
    case 'question':
      return (
        <QuestionScreen
          dishes={dishes}
          session={session}
          tags={freeTags}
          onAnswer={(def, value) => proceed(answerQuestion(session, def, value))}
          onSkip={(def) => proceed(skipQuestion(session, def))}
          onBack={restart}
        />
      );
    case 'result':
      return (
        <ResultScreen
          dishes={dishes}
          session={session}
          tags={freeTags}
          onReject={(name) => setSession(excludeDish(session, name))}
          onRestart={restart}
        />
      );
  }
}
