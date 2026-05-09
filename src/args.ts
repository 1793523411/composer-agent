export type ParsedArgs = {
  cwd: string;
  model: string;
  modelProvided: boolean;
  once: boolean;
  help: boolean;
  continue: boolean;
  verbose: boolean;
  print: string | undefined;
  dangerouslySkipPermissions: boolean;
  permissionMode: "default" | "bypass" | "plan" | undefined;
  allowedTools: string[];
  positional: string[];
};

const DEFAULT_MODEL = "composer-2";

export function parseArgs(argv: string[]): ParsedArgs {
  const help = argv.includes("--help") || argv.includes("-h");
  const args = argv.filter((a) => a !== "--help" && a !== "-h");
  const positional: string[] = [];
  let cwd = process.cwd();
  let model = process.env.CURSOR_MODEL ?? DEFAULT_MODEL;
  let modelProvided = false;
  let once = false;
  let verbose = false;
  let print: string | undefined;
  let dangerouslySkipPermissions = false;
  let continueSession = false;
  const allowedTools: string[] = [];

  while (args.length > 0) {
    const a = args.shift()!;
    if (a === "--once") once = true;
    else if (a === "--verbose") verbose = true;
    else if (a === "--dangerously-skip-permissions") dangerouslySkipPermissions = true;
    else if (a === "--continue") continueSession = true;
    else if (a === "--cwd" && args[0]) cwd = args.shift()!;
    else if (a === "--model" && args[0]) {
      model = args.shift()!;
      modelProvided = true;
    }
    else if (a === "--allowed-tools" && args[0]) {
      const raw = args.shift()!;
      allowedTools.push(...raw.split(",").map((name) => name.trim()).filter(Boolean));
    }
    else if (a === "--print" && args[0]) print = args.shift()!;
    else if (a.startsWith("--")) continue;
    else positional.push(a);
  }

  return {
    cwd,
    model,
    modelProvided,
    once,
    help,
    verbose,
    print,
    continue: continueSession,
    dangerouslySkipPermissions,
    permissionMode: undefined,
    allowedTools,
    positional,
  };
}

export function printHelp() {
  const lines = [
    "Cursor Code Agent（@cursor/sdk 本地 + Ink TUI）",
    "",
    "配置：根目录 .env：CURSOR_API_KEY=… ；可选 CURSOR_MODEL。",
    "",
    "命令：",
    "  npm start              Ink 终端界面（多轮，可改仓库内代码）",
    "  npm run once -- …      无 TUI，单条提示后退出",
    "",
    "参数：",
    "  --cwd <path>   工作区（默认当前目录）",
    "  --model <id>   模型 id",
    "  --allowed-tools <names>  工具白名单，逗号分隔（如 read_file,grep,bash）",
    "  --verbose      显示 thinking 过程",
    "  --print <prompt> 单次执行模式，输出结果后退出",
    "  --once         仅 npm run once 有意义",
    "  --continue     恢复上次会话",
    "  --dangerously-skip-permissions  跳过权限确认",
    "  -h, --help",
    "",
    "TUI：/help /compact /think /cwd /model /clear /exit；! 本机 shell；其余发给 Agent。",
  ];
  console.log(lines.join("\n"));
}
