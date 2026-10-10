import { useState } from 'react';
import dishesJson from './data/dishes.json';
import type { Dish, FreeItem } from './logic/types';
import {
  answerQuestion,
  createSession,
  excludeDish,
  isFinished,
  removeFreeItem,
  skipQuestion,
  withFreeItems,
  type SessionState,
} from './logic/engine';
import { dictionaryInterpreter } from './logic/interpreter';
import StartScreen from './screens/StartScreen';
import FreeInputScreen from './screens/FreeInputScreen';
import QuestionScreen from './screens/QuestionScreen';
import ResultScreen from './screens/ResultScreen';
import DataScreen from './screens/DataScreen';

const dishes = dishesJson as Dish[];

type Screen = 'start' | 'free' | 'question' | 'result' | 'data';

export default function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [session, setSession] = useState<SessionState>(() => createSession(dishes));

  /** 状態を更新し、終了条件を満たしていれば結果画面へ */
  const proceed = (next: SessionState) => {
    setSession(next);
    setScreen(isFinished(dishes, next) ? 'result' : 'question');
  };

  const startAkinator = () => proceed(createSession(dishes));

  const restart = () => {
    setSession(createSession(dishes));
    setScreen('start');
  };

  switch (screen) {
    case 'start':
      return (
        <StartScreen onAkinator={startAkinator} onFree={() => setScreen('free')} onData={() => setScreen('data')} />
      );
    case 'data':
      return <DataScreen dishes={dishes} onBack={() => setScreen('start')} />;
    case 'free':
      return (
        <FreeInputScreen
          // 入力文はここで解釈して捨てる（保存しない）
          interpret={(text) => dictionaryInterpreter.interpret(text)}
          onConfirm={(items: FreeItem[]) => proceed(withFreeItems(createSession(dishes), items))}
          onAkinator={startAkinator}
          onBack={restart}
        />
      );
    case 'question':
      return (
        <QuestionScreen
          dishes={dishes}
          session={session}
          onAnswer={(def, value) => proceed(answerQuestion(session, def, value))}
          onSkip={(def) => proceed(skipQuestion(session, def))}
          onRemoveTag={(id) => proceed(removeFreeItem(session, id))}
          onBack={restart}
        />
      );
    case 'result':
      return (
        <ResultScreen
          dishes={dishes}
          session={session}
          onReject={(name) => setSession(excludeDish(session, name))}
          onRemoveTag={(id) => proceed(removeFreeItem(session, id))}
          onRestart={restart}
        />
      );
  }
}
