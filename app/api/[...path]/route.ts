import {env} from "cloudflare:workers";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import {serve,type Bindings} from "@/lib/service";
export const dynamic="force-dynamic";
async function handle(req:Request){const user=await getChatGPTUser();return serve(req,env as unknown as Bindings,user?.userId??null);}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};
