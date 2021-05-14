import { main } from "https://deno.land/x/denops_std@v0.8/mod.ts";
import { existsSync } from "https://deno.land/std@0.93.0/fs/mod.ts";
import { isAbsolute, join } from "https://deno.land/std/path/mod.ts";

const URL_LIST =
  "https://www.toptal.com/developers/gitignore/api/list?format=json";
const URL_BASE = "https://www.toptal.com/developers/gitignore/api";

/*
  git のルートを見つける
*/
export function findGitRoot(filepath = Deno.cwd()): string | null {
  let current = isAbsolute(filepath) ? filepath : join(Deno.cwd(), filepath);
  // ディレクトリじゃなかったら、親にする
  current = Deno.statSync(current).isDirectory ? current : join(current, "..");

  let parent = join(current, "..");

  for (; parent! !== current;) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }
    current = parent!;
    parent = join(current, "..");
  }

  if (existsSync(join(current, ".git"))) {
    return current;
  }

  return null;
}

// 言語の一覧をリストで返す
async function fetchLanguageList() {
  const res = await fetch(URL_LIST);
  if (!res.ok) {
    throw new Error("HTTP-Error: " + res.status);
  }
  return Object.keys(await res.json());
}

async function getText(...languages: Array<unknown>): Promise<string> {
  const res = await fetch(`${URL_BASE}/${languages.join(",")}`);
  if (!res.ok) {
    throw new Error("HTTP-Error: " + res.status);
  }
  return await res.text();
}

main(async ({ vim }) => {
  let cache_dir = (await vim.call(
    "expand",
    await vim.g.get("dps_gignore_cache_dir", "~/.cache/dps-gignore"),
  )) as string;

  cache_dir = cache_dir.replace("/$", "");
  const cache_path = `${cache_dir}/languages`;

  vim.register({
    getText,

    async getLanguages(): Promise<string[]> {
      if (!existsSync(cache_dir)) {
        Deno.mkdirSync(cache_dir, { recursive: true });
      }

      if (existsSync(cache_path)) {
        return Deno.readTextFileSync(cache_path).split("\n");
      }

      // もし、キャッシュがなければリクエストして、一覧を取得する
      const languages = await fetchLanguageList();
      await Deno.writeTextFile(cache_path, languages.join("\n"));
      return languages;
    },

    async setlines(...languages: Array<unknown>): Promise<void> {

      const buflines = await vim.call('line', '$');
      const first_text = await vim.call('getline', 1);

      let text = await getText(languages);
      if (buflines == 1 && first_text == ''){
        text = text.replace(/^\n/, '');
      }

      vim.call("setline", 1, text.split(/\n/));
    },

    async genGitignore(...languages: Array<unknown>): Promise<void> {
      const root = findGitRoot((await vim.call("getcwd")) as string);
      if (root == null) {
        vim.cmd(
          'echomsg "[dps-gignore] Error: not a git repository (or any parent up to mount point /)"',
        );
        return;
      }

      // git リポジトリなら .gitignore を生成する
      const gitignore = join(root, ".gitignore");

      if (existsSync(gitignore)) {
        // もし、 .gitignore があったら、上書きするか聞く
        const res = await vim.call('confirm', 'The .gitignore already exists. Do you want to overwrite it?', "&No\n&Yes");
        if (res == 1) {
          vim.cmd('echomsg "[dps-gignore] Canceled"');
          return;
        } else {
          Deno.removeSync(gitignore);
        }
      }

      const text = await getText(languages);
      Deno.writeTextFileSync(gitignore, text.replace(/^\n/, ''));

      vim.cmd('echomsg "[dps-gignore] Success: generated .gitignore"');
    },
  });

  await vim.execute(`
    command! -nargs=+ -complete=customlist,denops#gignore#complete GignoreSetlines call denops#request('${vim.name}', 'setlines', [<f-args>])
    command! -nargs=+ -complete=customlist,denops#gignore#complete GignoreGenerate call denops#request('${vim.name}', 'genGitignore', [<f-args>])
  `);
});
