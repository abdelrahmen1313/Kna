import express, { type Request, type Response } from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const _dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(_dirname, "public");

export const PORT = 3213;

const app = express();

app.use(cors());
app.use(express.static(publicDir));

app.get("/", (req : Request, res : Response) => {
    res.sendFile(join(publicDir, "index.html"));
});

export function httpListen(port : number)
{
    return app.listen(PORT, () => {
        console.log('express app listening at port 3213');
    })

};