import { TOKEN } from "@/config";
import initialzeCommands from "@/handlers/initialzeCommands";
import { SlashCommandProps } from "@/types/command";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { promises, readdirSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";

export const srcDir = path.join(__dirname, '..');

export default class BotClient extends Client {
    public commands = new Collection<string, SlashCommandProps>();
    public t = new Collection<string, any>();
    constructor() {
        super({
            intents: [GatewayIntentBits.MessageContent],
            presence: {
                status: 'online',
                activities: [{
                    name: "/weather | /ai"
                }]
            }
        });
    };

    public async init() {
        await initialzeCommands(this);
        await this.setupLocalization();
        await this.setupEvents();
        this.login(TOKEN);
    }

    private async setupEvents() {
        console.log("Initilizing events")
        const eventsDir = path.join(srcDir, 'events');
        for (const event of readdirSync(path.join(eventsDir))) {
            const filepath = path.join(eventsDir, event);
            const fileURL = pathToFileURL(filepath).href
            const EventClass = await (await import(fileURL)).default;
            new EventClass(this);
        }
    };
    private async setupLocalization() {
        console.log("Initilizing localization languages..")
        const localesDir = path.join(srcDir, '..', 'locales');
        for (const locale of readdirSync(path.join(localesDir)).filter(f => f.endsWith('.json'))) {
            const localeFile = path.join(localesDir, locale);
            const data = await promises.readFile(localeFile, { encoding: "utf8" });
            this.t.set(locale.split('.')[0], JSON.parse(data))
        }
    }
    public async getLocaleText(key: string, locale: string, replaces = {}): Promise<string> {
        const fallbackLocale = 'en-US';

        let langMap = this.t.get(locale) || this.t.get(fallbackLocale);

        const getValueFromMap = (map: any, keyPath: string): any => {
            return keyPath.split('.').reduce((prev, cur) => (prev && prev[cur] !== undefined) ? prev[cur] : undefined, map);
        };

        let text = getValueFromMap(langMap, key);

        // If value is undefined, try fallback
        if (text === undefined && locale !== fallbackLocale) {
            langMap = this.t.get(fallbackLocale);
            text = getValueFromMap(langMap, key);
        }

        for (const [varName, value] of Object.entries(replaces)) {
            const regex = new RegExp(`{${varName}}`, "g");
            text = text.replace(regex, value);
        }

        return text;
    }
};