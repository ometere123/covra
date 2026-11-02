import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required to run SQL migrations");
const sql = postgres(url, { max: 1, ssl: "require" });
try {
  await sql`create table if not exists covra_schema_migrations (
    filename text primary key, applied_at timestamptz not null default now()
  )`;
  const folder=join(process.cwd(),"supabase/migrations");
  const filenames=readdirSync(folder).filter(name=>/^[0-9]+_[a-z_]+[.]sql$/.test(name)).sort();
  for(const filename of filenames){
    await sql.begin(async transaction=>{
      // Serialize all migrations using an advisory lock during each transaction.
      await transaction`select pg_advisory_xact_lock(4221,84532)`;
      const exists=await transaction`select filename from covra_schema_migrations where filename=${filename}`;
      if(exists.length)return;
      const migration=readFileSync(join(folder,filename),"utf8");
      await transaction.unsafe(migration);
      await transaction`insert into covra_schema_migrations(filename) values(${filename})`;
      process.stdout.write(`Applied ${filename}\n`);
    });
  }
  process.stdout.write("COVRA migrations checked; existing applied migrations preserved.\n");
} finally {
  await sql.end();
}
