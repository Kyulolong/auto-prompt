// Smoke test for the alignment engine. Run: npm run test:align
import { prepareScript } from "../src/korean/script";
import { Aligner } from "../src/engine/align";

const script =
  "안녕하세요 여러분 오늘은 제가 직접 만든 프롬프터를 소개합니다 " +
  "이 앱은 제 목소리를 듣고 대본을 따라 스크롤합니다 " +
  "2025년 기준으로 정말 유용한 도구예요 구독과 좋아요 잊지 마세요";
const prepared = prepareScript(script);
const words = prepared.tokens.map((t) => t.raw);

const aligner = new Aligner(prepared);
aligner.reset(0);

let t = 0;
let pass = 0;
let fail = 0;
function step(tail: string[], expectAround: number | null, note: string) {
  t += 420;
  const r = aligner.push(tail, t);
  const label = prepared.tokens[r.token]?.raw ?? "?";
  let ok = true;
  if (expectAround === null) ok = !r.moved; // should hold
  else ok = Math.abs(r.token - expectAround) <= 1 && !r.lost;
  if (ok) pass++;
  else fail++;
  console.log(
    `${ok ? "✓" : "✗"} [${note}]  spoke=${JSON.stringify(tail)}  -> token ${r.token} "${label}"` +
      `${expectAround === null ? " (expected: hold)" : ` (expected ≈ ${expectAround} "${words[expectAround]}")`}` +
      `${r.lost ? " LOST" : ""}`,
  );
}

console.log("script tokens:", words.map((w, i) => `${i}:${w}`).join("  "), "\n");

step(["안녕하세요"], 0, "verbatim start");
step(["안녕하세요", "여러분"], 1, "verbatim");
step(["여러분", "오늘은"], 2, "verbatim");
step(["오늘은", "제가", "직접"], 4, "verbatim run");
step(["직접", "만던"], 5, "STT error 만든→만던 (jamo tolerance)");
step(["만든", "프롬프터를", "소개합니다"], 7, "verbatim");
step(["그러니까", "음", "저기요"], null, "ad-lib not in script -> hold at 7");
step(["이", "앱은", "제", "목소리를"], 11, "resume + skip forward past ad-lib");
step(["듣고", "대본을", "따라"], 14, "verbatim");
step(["스크롤합니다"], 15, "verbatim");
step(["이천이십오년", "기준으로"], 17, "number: '이천이십오년' matches '2025년'");
step(["정말", "유용한", "도구예요"], 20, "verbatim");
step(["구독과", "좋아요"], 22, "verbatim (cursor = last word spoken)");
step(["잊지", "마세요"], 24, "verbatim to end");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
