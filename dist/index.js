import { PORT, httpListen } from './server.js';
async function main() {
    await httpListen(PORT);
}
main()
    .then(() => console.log("app mounted"))
    .catch((err) => {
    console.log("error launching the application");
    process.exit(1);
});
//# sourceMappingURL=index.js.map