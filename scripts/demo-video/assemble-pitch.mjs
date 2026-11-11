// Slides + live demo + slides, with neural narration. Writes demo-video/proofpay-pitch-demo.mp4 + .srt
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const base = "C:\\dev\\ProofPay\\demo-video";
const tmp = `${base}\\parts`;
mkdirSync(tmp, { recursive: true });
const t = JSON.parse(readFileSync(`${base}\\timeline.json`, "utf8"));
const N = JSON.parse(readFileSync(`${base}\\neural\\neural.json`, "utf8"));
const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
const NAVY = "0x12355B";

const cuts = t.cuts.filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
const mapT = (x) => x - cuts.filter((c) => c.end <= x).reduce((s, c) => s + c.end - c.start, 0);
const at = Object.fromEntries(t.narration.map((n) => [n.i, mapT(n.at)]));

const enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "160k"];
const parts = [];
const srt = [];
let clock = 0;

function slidePart(png, clip, name, lead = 0.4, tail = 0.8) {
  const d = lead + clip.duration + tail;
  const out = `${tmp}\\${name}.mp4`;
  ff([
    "-loop", "1", "-t", d.toFixed(2), "-i", png, "-i", clip.file,
    "-filter_complex",
    `[0:v]scale=1280:720,fade=t=in:st=0:d=0.3,fade=t=out:st=${(d - 0.3).toFixed(2)}:d=0.3[v];[1:a]adelay=${Math.round(lead * 1000)}|${Math.round(lead * 1000)},apad,atrim=0:${d.toFixed(2)}[a]`,
    "-map", "[v]", "-map", "[a]", ...enc, "-t", d.toFixed(2), out,
  ]);
  srt.push([clock + lead, clock + lead + clip.duration, clip.text]);
  clock += d;
  parts.push(out);
}

const S = (n) => `${base}\\slides\\s${n}.png`;
const [s1, s2, s3] = N.intro;
slidePart(S(1), s1, "p1", 0.4, 0.5);
slidePart(S(3), s2, "p2", 0.3, 0.6);
slidePart(S(4), s3, "p3", 0.4, 0.4);

// Demo: from just before narration 1 to the start of the old closing card (narration 9).
// First frame of the real app in this recording (the site was slow to load, so the title card ran long).
const appStart = Number(process.env.APP_START ?? at[1]);
const n8 = N.demo.find((d) => d.i === 8);
const segStart = appStart, segEnd = Math.min(at[9], at[8] + n8.duration + 0.6);
// Hold the first board frame so narration 1 fits before narration 2.
const n1 = N.demo.find((d) => d.i === 1);
const N1_TEMPO = 1.1; // opening demo line plays over a frozen frame; slightly faster keeps the total under 3:00
const hold = Math.max(0, n1.duration / N1_TEMPO + 0.4 - (at[2] - appStart));
const segLen = segEnd - segStart + hold;
const demo = N.demo.sort((a, b) => a.i - b.i);
const inputs = ["-ss", segStart.toFixed(3), "-t", (segEnd - segStart).toFixed(3), "-i", `${base}\\proofpay-demo.mp4`];
const filters = [`[0:v]tpad=start_duration=${hold.toFixed(2)}:start_mode=clone,scale=1152:720,pad=1280:720:64:0:color=${NAVY},fade=t=in:st=0:d=0.3,fade=t=out:st=${(segLen - 0.4).toFixed(2)}:d=0.4[v]`];
demo.forEach((d, k) => {
  inputs.push("-i", d.file);
  const start = d.i === 1 ? 0 : at[d.i] - segStart + hold;
  const room = (k + 1 < demo.length ? at[demo[k + 1].i] - segStart + hold : segLen) - start - 0.2;
  const tempo = d.i === 1 ? N1_TEMPO : d.duration > room ? Math.min(1.15, d.duration / room) : 1;
  const ms = Math.round(start * 1000);
  filters.push(`[${k + 1}:a]aresample=48000,atempo=${tempo.toFixed(3)},adelay=${ms}|${ms}[a${k}]`);
  srt.push([clock + start, clock + start + d.duration / tempo, d.text]);
});
filters.push(`${demo.map((_, k) => `[a${k}]`).join("")}amix=inputs=${demo.length}:normalize=0,apad,atrim=0:${segLen.toFixed(3)}[a]`);
const demoOut = `${tmp}\\p4-demo.mp4`;
ff([...inputs, "-filter_complex", filters.join(";"), "-map", "[v]", "-map", "[a]", ...enc, "-t", segLen.toFixed(3), demoOut]);
parts.push(demoOut);
clock += segLen;

// Ledger: AG Grid + AG Charts across all projects, recorded separately with real data.
{
  const L = JSON.parse(readFileSync(`${base}\\ledger-raw.json`, "utf8"));
  const clip = N.ledger;
  const from = L.ready + 0.4; // after AG Grid's row animation settles
  const d = Math.min(L.end - from, clip.duration + 0.9);
  const out = `${tmp}\\p4b-ledger.mp4`;
  ff([
    "-ss", from.toFixed(2), "-t", d.toFixed(2), "-i", `${base}\\ledger-raw.webm`, "-i", clip.file,
    "-loop", "1", "-t", d.toFixed(2), "-i", `${base}\\ledger-caption.png`,
    "-filter_complex",
    // Same caption box as the demo recording (record-demo.mjs), drawn at 1280x800 and scaled with the frame.
    `[0:v][2:v]overlay=0:0:enable='between(t,0.3,${(0.3 + clip.duration).toFixed(2)})',scale=1152:720,pad=1280:720:64:0:color=${NAVY},fps=30,fade=t=in:st=0:d=0.3,fade=t=out:st=${(d - 0.3).toFixed(2)}:d=0.3[v];[1:a]aresample=48000,adelay=300|300,apad,atrim=0:${d.toFixed(2)}[a]`,
    "-map", "[v]", "-map", "[a]", ...enc, "-t", d.toFixed(2), out,
  ]);
  srt.push([clock + 0.3, clock + 0.3 + clip.duration, clip.text]);
  clock += d;
  parts.push(out);
}

const [o1, o2] = N.outro;
slidePart(S(13), o1, "p5", 0.3, 0.7);
slidePart(S(14), o2, "p6", 0.3, 1.0);

writeFileSync(`${tmp}\\list.txt`, parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
const final = `${base}\\proofpay-pitch-demo.mp4`;
ff(["-f", "concat", "-safe", "0", "-i", `${tmp}\\list.txt`, "-c", "copy", "-movflags", "+faststart", final]);

const ts = (s) => {
  const ms = Math.round(s * 1000), p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
writeFileSync(`${base}\\proofpay-pitch-demo.srt`, srt.map(([a, b, x], i) => `${i + 1}\n${ts(a)} --> ${ts(b)}\n${x}\n`).join("\n"));
console.log(`total ${clock.toFixed(1)} s, demo segment ${segLen.toFixed(1)} s`);
