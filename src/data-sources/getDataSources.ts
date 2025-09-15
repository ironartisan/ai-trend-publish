import { ConfigManager } from "@src/utils/config/config-manager.ts";
import db from "@src/db/db.ts";
import { dataSources } from "@src/db/schema.ts";
import { Logger } from "@zilla/logger";
export type NewsPlatform = "firecrawl" | "twitter";

const logger = new Logger("getDataSources");

interface SourceItem {
  identifier: string;
}

type SourceConfig = Record<NewsPlatform, SourceItem[]>;

// 本地源配置
export const sourceConfigs: SourceConfig = {
  firecrawl: [
    // { identifier: "https://news.ycombinator.com/" },
    {
      identifier:
        "https://www.reuters.com/technology/artificial-intelligence/",
    },
    { identifier: "https://simonwillison.net/" },
    { identifier: "https://buttondown.com/ainews/archive/" },
    { identifier: "https://www.aibase.com/zh/daily" },
    { identifier: "https://m.weibo.cn/u/1402400261?luicode=10000011&lfid=231583" },
    { identifier: "https://m.weibo.cn/u/1727858283?t=0&luicode=10000011&lfid=1076031402400261" },
    { identifier: "https://towardsdatascience.com/latest/" },
    { identifier: "https://medium.com/?tag=machine-learning" },
    { identifier: "https://www.jiqizhixin.com" },
    { identifier: "https://www.zhihu.com/org/xin-zhi-yuan-88-3/posts" },
    { identifier: "https://www.qbitai.com" },
    { identifier: "https://tophub.today/c/tech?q=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD" },

  ],
  twitter: [
    // { identifier: "https://x.com/OpenAIDevs" },
    // { identifier: "https://x.com/xai" },
    // { identifier: "https://x.com/alexalbert__" },
    // { identifier: "https://x.com/leeerob" },
    // { identifier: "https://x.com/v0" },
    // { identifier: "https://x.com/aisdk" },
    // { identifier: "https://x.com/firecrawl_dev" },
    // { identifier: "https://x.com/AIatMeta" },
    // { identifier: "https://x.com/googleaidevs" },
    // { identifier: "https://x.com/MistralAI" },
    // { identifier: "https://x.com/Cohere" },
    // { identifier: "https://x.com/karpathy" },
    // { identifier: "https://x.com/ylecun" },
    // { identifier: "https://x.com/sama" },
    // { identifier: "https://x.com/EMostaque" },
    // { identifier: "https://x.com/DrJimFan" },
    // { identifier: "https://x.com/nickscamara_" },
    // { identifier: "https://x.com/CalebPeffer" },
    // { identifier: "https://x.com/akshay_pachaar" },
    // { identifier: "https://x.com/ericciarla" },
    // { identifier: "https://x.com/amasad" },
    // { identifier: "https://x.com/nutlope" },
    // { identifier: "https://x.com/rauchg" },
    // { identifier: "https://x.com/vercel" },
    // { identifier: "https://x.com/LangChainAI" },
    // { identifier: "https://x.com/llama_index" },
    // { identifier: "https://x.com/pinecone" },
    // { identifier: "https://x.com/modal_labs" },
    // { identifier: "https://x.com/huggingface" },
    // { identifier: "https://x.com/weights_biases" },
    // { identifier: "https://x.com/replicate" },
    // //custom
    // { identifier: "https://x.com/omarsar0" },
    // { identifier: "https://x.com/dotey" },
    // { identifier: "https://x.com/DrJimFan" },
    // { identifier: "https://x.com/AndrewYNg" },
    // { identifier: "https://x.com/DeepLearn007" },
    // { identifier: "https://x.com/TamaraMcCleary" },
    // { identifier: "https://x.com/IoTRecruiting" },
    // { identifier: "https://x.com/KirkDBorne" },
    // { identifier: "https://x.com/BernardMarr" },
    // { identifier: "https://x.com/DavidBrin" },
    // { identifier: "https://x.com/drfeifei" },
    
    // { identifier: "https://x.com/orangebook_" },
    // { identifier: "https://x.com/navalismhq" },
    // { identifier: "https://x.com/sahilbloom" },
    // { identifier: "https://x.com/dickiebush" },
    // { identifier: "https://x.com/naval" },
    // { identifier: "https://x.com/fortelabs" },
    // { identifier: "https://x.com/david_perell" },
    // { identifier: "https://x.com/jamesclear" },
    // { identifier: "https://x.com/alexhormozi" },
    // { identifier: "https://x.com/shaneaparrish" },
    
    // // Tech & Thought Leaders
    // { identifier: "https://x.com/EMostaque" },
    // { identifier: "https://x.com/paulg" },
    // { identifier: "https://x.com/waitbutwhy" },
    // { identifier: "https://x.com/mmay3r" },
    // { identifier: "https://x.com/dhh" },
    // { identifier: "https://x.com/balajis" },
    // { identifier: "https://x.com/jackbutcher" },
    // { identifier: "https://x.com/visualizevalue" },
    // { identifier: "https://x.com/george__mack" },
    // { identifier: "https://x.com/simonsinek" },
    
    // // Authors & Entrepreneurs
    // { identifier: "https://x.com/tferriss" },
    // { identifier: "https://x.com/sama" },
    // { identifier: "https://x.com/hubermanlab" },
    // { identifier: "https://x.com/jaltma" },
  ],
} as const;

interface DbSource {
  identifier: string;
  platform: NewsPlatform;
}

export const getDataSources = async (): Promise<SourceConfig> => {
  const configManager = ConfigManager.getInstance();
  try {
    const dbEnabled = await configManager.get("ENABLE_DB");
    const mergedSources: SourceConfig = JSON.parse(
      JSON.stringify(sourceConfigs),
    );

    if (dbEnabled) {
      logger.info("开始从数据库获取数据源");
      const dbResults = await db.select({
        identifier: dataSources.identifier,
        platform: dataSources.platform,
      })
        .from(dataSources);

      // 处理数据库结果
      dbResults.forEach((item) => {
        const { platform, identifier } = item;
        if (
          identifier !== null &&
          platform !== null &&
          platform in mergedSources
        ) {
          const exists = mergedSources[platform as NewsPlatform].some(
            (source) => source.identifier === identifier,
          );
          if (!exists) {
            mergedSources[platform as NewsPlatform].push({ identifier });
          }
        }
      });
    }

    return mergedSources;
  } catch (error) {
    console.error("Failed to get data sources from database:", error);
    // 数据库不可用时返回本地配置
    return sourceConfigs;
  }
};
