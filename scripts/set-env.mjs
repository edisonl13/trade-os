/**
 * Set Vercel environment variables correctly without shell pipe issues.
 * Usage: node scripts/set-env.mjs
 */
import { execSync } from "child_process";

const vars = [
  { name: "DATABASE_URL", value: "libsql://trade-os-edisonl13.aws-ap-northeast-1.turso.io" },
  { name: "DATABASE_AUTH_TOKEN", value: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODQ4ODE2OTYsImlkIjoiMDE5ZjkzM2MtZWYwMS03ZThkLTgzZDYtNjViNWM1YmY5YTA2Iiwia2lkIjoiYlg3V1RXckVfZnJRRHZQQjNsYl96YzFlM1RzbmZtRTBUblViOGd1aEtrMCIsInJpZCI6ImIyY2M4ZTQ1LTBmZTYtNGJhZC1iYjQ4LTIzNzc2M2ViMzgwMyJ9.qtI9uCeAc5TI_HcwJG7todLCsbhkj6v3FjSxHkzxQV-Lspx3kjQulp0IMyTLEnBaGp_fWadcmfgU42IamB-BBA" },
];

for (const v of vars) {
  console.log(`Setting ${v.name}...`);
  // Use child_process with stdin to avoid shell interpretation issues
  execSync(`npx vercel env add ${v.name} production --yes`, {
    input: v.value,
    stdio: ["pipe", "inherit", "inherit"],
    cwd: process.cwd(),
  });
  console.log(`  ✓ ${v.name} set`);
}

console.log("\nAll environment variables set successfully!");
