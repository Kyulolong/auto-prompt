// Smoke test for the alignment engine. Run: npm run test:align
import { prepareScript } from "../src/korean/script";
import { Aligner } from "../src/engine/align";

let pass = 0;
let fail = 0;

// expect: a token index (matched within ±1) — a "hold" is just expecting the
// same index as the previous step.
function scenario(name: string, scriptText: string, steps: Array<[string[], number, string]>) {
  const prepared = prepareScript(scriptText);
  const words = prepared.tokens.map((t) => t.raw);
  console.log(`\n=== ${name} ===`);
  console.log(words.map((w, i) => `${i}:${w}`).join("  "));
  const aligner = new Aligner(prepared);
  aligner.reset(0);
  let t = 0;
  for (const [tail, expect, note] of steps) {
    t += 420;
    const r = aligner.push(tail, t);
    const label = prepared.tokens[r.token]?.raw ?? "?";
    const ok = Math.abs(r.token - expect) <= 1 && !r.lost;
    ok ? pass++ : fail++;
    console.log(
      `${ok ? "✓" : "✗"} [${note}]  ${JSON.stringify(tail)} -> ${r.token} "${label}"` +
        ` (want ≈ ${expect} "${words[expect]}")${r.lost ? " LOST" : ""}`,
    );
  }
}

scenario(
  "기본 낭독 · 오타 · 애드립 · 건너뛰기 · 숫자",
  "안녕하세요 여러분 오늘은 제가 직접 만든 프롬프터를 소개합니다 " +
    "이 앱은 제 목소리를 듣고 대본을 따라 스크롤합니다 " +
    "2025년 기준으로 정말 유용한 도구예요 구독과 좋아요 잊지 마세요",
  [
    [["안녕하세요"], 0, "낭독 시작"],
    [["안녕하세요", "여러분"], 1, "낭독"],
    [["여러분", "오늘은"], 2, "낭독"],
    [["오늘은", "제가", "직접"], 4, "낭독"],
    [["직접", "만던"], 5, "STT 오타 만든→만던 (자모 허용)"],
    [["만든", "프롬프터를", "소개합니다"], 7, "낭독"],
    [["그러니까", "음", "저기요"], 7, "애드립 → 위치 유지"],
    [["이", "앱은", "제", "목소리를"], 11, "복귀 + 앞으로 점프"],
    [["듣고", "대본을", "따라"], 14, "낭독"],
    [["스크롤합니다"], 15, "낭독"],
    [["이천이십오년", "기준으로"], 17, "숫자: 이천이십오년 = 2025년"],
    [["정말", "유용한", "도구예요"], 20, "낭독"],
    [["구독과", "좋아요"], 22, "낭독 (커서 = 마지막 발화 단어)"],
    [["잊지", "마세요"], 24, "끝까지"],
  ],
);

scenario(
  "영어 혼합 · 건너뛰기 · 역방향 지터 억제",
  "저는 AI 스타트업을 만드는 개발자입니다 우리 팀은 iPhone 앱과 " +
    "안드로이드 앱을 둘 다 만듭니다 그리고 챗봇도 개발합니다",
  [
    [["저는", "ai"], 1, "영어 'AI'를 라틴 'ai'로 매칭"],
    [["ai", "스타트업을"], 2, "낭독"],
    [["만드는", "개발자입니다"], 4, "낭독"],
    [["우리", "팀은"], 6, "낭독"],
    [["앱과", "안드로이드"], 9, "영어 'iPhone'을 안 말해도 건너뛰고 따라옴"],
    [["음", "어"], 9, "잡음/애드립 → 뒤로 안 튐 (위치 유지)"],
    [["앱을", "둘", "다"], 12, "낭독"],
    [["만듭니다"], 13, "낭독"],
    [["앱을"], 13, "짧고 모호한 단어 하나로는 뒤로 안 튐 (지터 억제)"],
    [["둘", "다", "만듭니다"], 13, "가까운 구절 재독(강한 매칭) → 안정적으로 유지/복귀"],
    [["그리고", "챗봇도", "개발합니다"], 16, "다시 앞으로 이어서"],
  ],
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
