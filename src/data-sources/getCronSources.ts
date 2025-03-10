import { ConfigManager } from "../utils/config/config-manager";
import { EnvConfigSource } from "../utils/config/sources/env-config.source";
import { MySQLDB } from "../utils/db/mysql.db";

export type NewsType = "AI" | "Tech" | "Crypto" | "All";
export type NewsPlatform = "firecrawl" | "twitter";

interface SourceItem {
  identifier: string;
}

interface PlatformSources {
  firecrawl: SourceItem[];
  twitter: SourceItem[];
}

type SourceConfig = Record<NewsType, PlatformSources>;

interface CronSource {
  id: number;
  NewsType: NewsType;
  NewsPlatform: NewsPlatform;
  identifier: string;
}

// 本地源配置
export const sourceConfigs: SourceConfig = {
  AI: {
    firecrawl: [
      { identifier: "https://news.ycombinator.com/" },
      {
        identifier:
          "https://www.reuters.com/technology/artificial-intelligence/",
      },
      { identifier: "https://simonwillison.net/" },
      { identifier: "https://buttondown.com/ainews/archive/" },
      { identifier: "https://www.aibase.com/zh/daily" },
      { identifier: "https://www.aibase.com/zh/news" },
    ],
    twitter: [
      { identifier: "https://x.com/OpenAIDevs" },
      { identifier: "https://x.com/xai" },
      { identifier: "https://x.com/alexalbert__" },
      { identifier: "https://x.com/leeerob" },
      { identifier: "https://x.com/v0" },
      { identifier: "https://x.com/aisdk" },
      { identifier: "https://x.com/firecrawl_dev" },
      { identifier: "https://x.com/AIatMeta" },
      { identifier: "https://x.com/googleaidevs" },
      { identifier: "https://x.com/MistralAI" },
      { identifier: "https://x.com/Cohere" },
      { identifier: "https://x.com/karpathy" },
      { identifier: "https://x.com/ylecun" },
      { identifier: "https://x.com/sama" },
      { identifier: "https://x.com/EMostaque" },
      { identifier: "https://x.com/DrJimFan" },
      { identifier: "https://x.com/nickscamara_" },
      { identifier: "https://x.com/CalebPeffer" },
      { identifier: "https://x.com/akshay_pachaar" },
      { identifier: "https://x.com/ericciarla" },
      { identifier: "https://x.com/amasad" },
      { identifier: "https://x.com/nutlope" },
      { identifier: "https://x.com/rauchg" },
      { identifier: "https://x.com/vercel" },
      { identifier: "https://x.com/LangChainAI" },
      { identifier: "https://x.com/llama_index" },
      { identifier: "https://x.com/pinecone" },
      { identifier: "https://x.com/modal_labs" },
      { identifier: "https://x.com/huggingface" },
      { identifier: "https://x.com/weights_biases" },
      { identifier: "https://x.com/replicate" },
      //custom
      { identifier: "https://x.com/omarsar0" },
      { identifier: "https://x.com/dotey" },
      { identifier: "https://x.com/DrJimFan" },
      { identifier: "https://x.com/AndrewYNg" },
      { identifier: "https://x.com/DeepLearn007" },
      { identifier: "https://x.com/TamaraMcCleary" },
      { identifier: "https://x.com/IoTRecruiting" },
      { identifier: "https://x.com/KirkDBorne" },
      { identifier: "https://x.com/BernardMarr" },
      { identifier: "https://x.com/DavidBrin" },
      { identifier: "https://x.com/drfeifei" },
      
      { identifier: "https://x.com/orangebook_" },
      { identifier: "https://x.com/navalismhq" },
      { identifier: "https://x.com/sahilbloom" },
      { identifier: "https://x.com/dickiebush" },
      { identifier: "https://x.com/naval" },
      { identifier: "https://x.com/fortelabs" },
      { identifier: "https://x.com/david_perell" },
      { identifier: "https://x.com/jamesclear" },
      { identifier: "https://x.com/alexhormozi" },
      { identifier: "https://x.com/shaneaparrish" },
      
      // Tech & Thought Leaders
      { identifier: "https://x.com/EMostaque" },
      { identifier: "https://x.com/paulg" },
      { identifier: "https://x.com/waitbutwhy" },
      { identifier: "https://x.com/mmay3r" },
      { identifier: "https://x.com/dhh" },
      { identifier: "https://x.com/balajis" },
      { identifier: "https://x.com/jackbutcher" },
      { identifier: "https://x.com/visualizevalue" },
      { identifier: "https://x.com/george__mack" },
      { identifier: "https://x.com/simonsinek" },
      
      // Authors & Entrepreneurs
      { identifier: "https://x.com/tferriss" },
      { identifier: "https://x.com/sama" },
      { identifier: "https://x.com/hubermanlab" },
      { identifier: "https://x.com/jaltma" },
    ],
  },
  Tech: {
    firecrawl: [],
    twitter: [],
  },
  Crypto: {
    firecrawl: [],
    twitter: [],
  },
  All: {
    firecrawl: [],
    twitter: [],
  },
} as const;

export const getCronSources = async (): Promise<SourceConfig> => {
  const configManager = ConfigManager.getInstance();
  try {
    const dbEnabled = await configManager.get("ENABLE_DB");
    let dbSources: CronSource[] = [];
    if (dbEnabled === "true") {
      const mysql = await MySQLDB.getInstance({
        host: await configManager.get("DB_HOST"),
        port: await configManager.get("DB_PORT"),
        user: await configManager.get("DB_USER"),
        password: await configManager.get("DB_PASSWORD"),
        database: await configManager.get("DB_DATABASE"),
      });
      dbSources = await mysql.query<CronSource>(
        "SELECT * FROM cron_sources"
      );
    }

    // 如果成功获取数据库数据，合并本地和数据库数据
    const mergedSources = { ...sourceConfigs };

    // 遍历数据库数据并合并到本地配置中
    if (Array.isArray(dbSources)) {
      for (const source of dbSources) {
        const { NewsType, NewsPlatform, identifier } = source;
        const newsTypeKey = NewsType as keyof SourceConfig;
        const platformKey = NewsPlatform as keyof PlatformSources;

        if (
          newsTypeKey in mergedSources &&
          platformKey in mergedSources[newsTypeKey]
        ) {
          const platform = mergedSources[newsTypeKey][platformKey];
          // 检查是否已存在相同的identifier
          const exists = platform.some(
            (item) => item.identifier === identifier
          );
          if (!exists) {
            platform.push({ identifier });
          }
        }
      }
    }

    return mergedSources;
  } catch (error) {
    console.error("Failed to get cron sources from database:", error);
    // 数据库不可用时返回本地配置
    return sourceConfigs;
  }
};
