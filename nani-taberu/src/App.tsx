import { useState } from 'react';
import dishesJson from './data/dishes.json';
import type { Dish, FreeItem, PolicyKey } from './logic/types';
import { POLICY_LABEL } from './logic/questions';
import {
  answerQuestion,
  createSession,
  excludeDish,
  isFinished,
  removeTag,
  resetEffortShift,
  shiftEffort,
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
import SettingsScreen from './screens/SettingsScreen';
import {
  loadPantry,
  loadProfile,
  loadSettings,
  savePantry,
  saveProfile,
  saveSettings,
  type Profile,
  type Settings,
} from './settings';
import DishDetailScreen from './screens/DishDetailScreen';
import type { SessionContext } from './logic/engine';
import { conditionQuery, conditionsFrom } from './logic/search';
import { evaluate } from './logic/engine';

const dishes = dishesJson as Dish[];

/** 今日の方針をタグ（外せるフリー入力の項目）として表す */
function policyItem(key: PolicyKey): FreeItem {
  return { id: `pol:${key}`, label: POLICY_LABEL[key], note: '', negate: false, answers: [{ kind: 'policy', key }] };
}

type Screen = 'start' | 'free' | 'question' | 'result' | 'data' | 'settings' | 'detail';

export default function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [session, setSession] = useState<SessionState>(() => createSession(dishes));
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [pantry, setPantry] = useState<string[]>(loadPantry);
  const [detailName, setDetailName] = useState<string | null>(null);
  /** スタート画面の「今日の方針」 */
  const [policies, setPolicies] = useState<PolicyKey[]>([]);
  const target = settings.recipeSearch;
  /** 設定・プロフィールからセッションの条件を作る（器具は登録済みかつスイッチオンのときだけ） */
  const ctx: SessionContext = {
    tools: settings.useToolFilter && profile.tools ? profile.tools : null,
    fatOrder: settings.fatCalorieOrder,
  };
  /** 新しいセッション。今日の方針はタグ（外せる）として最初から入れる */
  const newSession = (extra: FreeItem[] = []) => {
    const ids = new Set(extra.flatMap((i) => i.answers.flatMap((a) => (a.kind === 'policy' ? [a.key] : []))));
    const policyItems = policies.filter((p) => !ids.has(p)).map(policyItem);
    return withFreeItems(createSession(dishes, Math.random, ctx), [...policyItems, ...extra]);
  };

  /** 状態を更新し、終了条件を満たしていれば結果画面へ */
  const proceed = (next: SessionState) => {
    setSession(next);
    setScreen(isFinished(dishes, next) ? 'result' : 'question');
  };

  const startAkinator = () => proceed(newSession());

  const restart = () => {
    setSession(newSession());
    setScreen('start');
  };

  switch (screen) {
    case 'start':
      return (
        <StartScreen
          policies={policies}
          onPolicies={setPolicies}
          onAkinator={startAkinator}
          onFree={() => setScreen('free')}
          onData={() => setScreen('data')}
          onSettings={() => setScreen('settings')}
        />
      );
    case 'settings':
      return (
        <SettingsScreen
          profile={profile}
          onProfileChange={(next) => {
            setProfile(next);
            saveProfile(next);
          }}
          settings={settings}
          onChange={(next) => {
            setSettings(next);
            saveSettings(next);
          }}
          onBack={() => setScreen('start')}
        />
      );
    case 'detail': {
      const dish = dishes.find((d) => d.name === detailName);
      if (!dish) return null;
      return (
        <DishDetailScreen
          dish={dish}
          dishes={dishes}
          session={session}
          ev={evaluate(dishes, session)}
          ownedTools={profile.tools ?? null}
          pantry={pantry}
          onPantryChange={(items) => {
            setPantry(items);
            savePantry(items);
          }}
          searchTarget={target}
          onBack={() => setScreen('result')}
        />
      );
    }
    case 'data':
      return <DataScreen dishes={dishes} onBack={() => setScreen('start')} />;
    case 'free':
      return (
        <FreeInputScreen
          // 入力文はここで解釈して捨てる（保存しない）
          interpret={(text) => dictionaryInterpreter.interpret(text)}
          onConfirm={(items: FreeItem[]) => proceed(newSession(items))}
          searchTarget={target}
          conditionQueryFor={(items: FreeItem[]) => {
            const s = newSession(items);
            return conditionQuery(conditionsFrom(s, evaluate(dishes, s)), 'recipe', target);
          }}
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
          onRemoveTag={(id) => proceed(removeTag(session, id))}
          onBack={restart}
        />
      );
    case 'result':
      return (
        <ResultScreen
          dishes={dishes}
          session={session}
          onReject={(name) => setSession(excludeDish(session, name))}
          onRemoveTag={(id) => proceed(removeTag(session, id))}
          onShift={(delta) => setSession(shiftEffort(session, delta))}
          onResetShift={() => setSession(resetEffortShift(session))}
          onRestart={restart}
          searchTarget={target}
          onChoose={(name) => {
            setDetailName(name);
            setScreen('detail');
          }}
          onSettings={() => setScreen('settings')}
        />
      );
  }
}
