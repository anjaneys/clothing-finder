import { connections } from "@/lib/server-config";
export function GET(){return Response.json(connections(),{headers:{"Cache-Control":"no-store"}});}
