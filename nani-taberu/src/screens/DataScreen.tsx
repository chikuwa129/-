import { useState } from 'react';
import type { Dish } from '../logic/types';

interface Props {
  dishes: Dish[];
  onBack: () => void;
}

/** 料理データの確認用一覧（食材・やる気度の付与結果を人が見て直せるように） */
export default function DataScreen({ dishes, onBack }: Props) {
  const [tab, setTab] = useState<'ingredients' | 'effort'>('ingredients');
  const names = (d: Dish, role: 'main' | 'sub') =>
    d.ingredients
      .filter((i) => i.role === role)
      .map((i) => i.name)
      .join('、') || '—';

  return (
    <main className="screen data-screen">
      <header className="topbar">
        <button className="link" onClick={onBack}>
          ← もどる
        </button>
        <span className="progress-label">全{dishes.length}品</span>
      </header>
      <h2 className="question">料理データ一覧</h2>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'ingredients'} onClick={() => setTab('ingredients')}>
          食材
        </button>
        <button role="tab" aria-selected={tab === 'effort'} onClick={() => setTab('effort')}>
          やる気度
        </button>
      </div>
      <div className="table-wrap">
        {tab === 'ingredients' ? (
          <table>
            <thead>
              <tr>
                <th>料理名</th>
                <th>主役（main）</th>
                <th>脇役（sub）</th>
              </tr>
            </thead>
            <tbody>
              {dishes.map((d) => (
                <tr key={d.name}>
                  <th scope="row">{d.name}</th>
                  <td>{names(d, 'main')}</td>
                  <td>{names(d, 'sub')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th>料理名</th>
                <th>手間</th>
                <th>包丁</th>
                <th>調理法</th>
                <th>お惣菜</th>
              </tr>
            </thead>
            <tbody>
              {dishes.map((d) => (
                <tr key={d.name}>
                  <th scope="row">{d.name}</th>
                  <td className="num">{d.effort}</td>
                  <td>{d.knife}</td>
                  <td>{d.method.join('・')}</td>
                  <td>{d.deliAlt ? '○' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="hint">手間 1=温める・茹でるだけ / 2=炒める・焼くだけ / 3=ふつう / 4=凝る</p>
    </main>
  );
}
