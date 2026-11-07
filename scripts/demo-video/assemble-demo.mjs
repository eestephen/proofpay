// Cuts the waits out of the raw recording, lays the narration on top, writes MP4 + SRT.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const out = "C:\\dev\\ProofPay\\demo-video";
const t = JSON.parse(readFileSync(`${out}\\timeline.json`, "utf8"));
const narration = JSON.parse(readFileSync(`${out}\\narration.json`, "utf8"));

const cuts = t.cuts.filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
const keep = [];
let cursor = 0;
for (const c of cuts) {
  if (c.start > cursor) keep.push([cursor, c.start]);
  cursor = Math.max(cursor, c.end);
}
keep.push([cursor, t.end]);

const mapTime = (x) => {
  let removed = 0;
  for (const c of cuts) if (c.end <= x) removed += c.end - c.start;
  return x - removed;
};

const vparts = keep.map(([a, b], i) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
const concat = `${keep.map((_, i) => `[v${i}]`).join("")}concat=n=${keep.length}:v=1:a=0,fps=30,format=yuv420p[v]`;
const inputs = ["-i", t.video];
const aparts = [];
t.narration.forEach((n, k) => {
  inputs.push("-i", narration[n.i].file);
  const ms = Math.round(mapTime(n.at) * 1000);
  aparts.push(`[${k + 1}:a]aresample=48000,adelay=${ms}|${ms}[a${k}]`);
});
const mix = `${t.narration.map((_, k) => `[a${k}]`).join("")}amix=inputs=${t.narration.length}:normalize=0,volume=1.6[a]`;
const total = keep.reduce((s, [a, b]) => s + (b - a), 0);

execFileSync(
  "ffmpeg",
  [
    "-v", "error", "-y", ...inputs,
    "-filter_complex", [...vparts, concat, ...aparts, mix].join(";"),
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-c:a", "aac", "-b:a", "160k", "-t", total.toFixed(2), "-movflags", "+faststart",
    `${out}\\proofpay-demo.mp4`,
  ],
  { stdio: "inherit" },
);

const ts = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const srt = t.narration
  .map((n, k) => {
    const start = mapTime(n.at);
    return `${k + 1}\n${ts(start)} --> ${ts(start + narration[n.i].duration)}\n${narration[n.i].text}\n`;
  })
  .join("\n");
writeFileSync(`${out}\\proofpay-demo.srt`, srt);
console.log(`kept ${keep.length} segments, final length ${total.toFixed(1)} s`);
