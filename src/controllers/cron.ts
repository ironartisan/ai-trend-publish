import cron from "node-cron";
import { WeixinWorkflow } from "../services/weixin-article.workflow";
import { Workflow } from "../services/interfaces/workflow.interface";
import { WeixinAIBenchWorkflow } from "../services/weixin-aibench.workflow";
import { WeixinHelloGithubWorkflow } from "../services/weixin-hellogithub.workflow";
import { PaperWorkflow } from "../services/paper.workflow";
// 工作流映射表，用于存储不同日期对应的工作流
const workflowMap = new Map<number, Workflow>();

// 初始化工作流映射
const initializeWorkflows = () => {
  // 周一的工作流 (1)
  workflowMap.set(1, new WeixinWorkflow());
  // 其他日期的工作流可以在这里添加
  workflowMap.set(2, new WeixinAIBenchWorkflow()); // 周二
  workflowMap.set(2, new PaperWorkflow());
  // workflowMap.set(3, new AnotherWorkflow()); // 周三
  workflowMap.set(3, new WeixinHelloGithubWorkflow()); // 周三

  workflowMap.set(4, new WeixinWorkflow());

  workflowMap.set(5, new WeixinWorkflow());

  workflowMap.set(6, new WeixinWorkflow());

  workflowMap.set(7, new WeixinWorkflow());



};

export const startCronJobs = async () => {
  console.log("初始化定时任务...");
  initializeWorkflows();

  // 每天凌晨6点执行
  cron.schedule(
    "0 6 * * *",
    async () => {
      const dayOfWeek = new Date().getDay(); // 0是周日，1-6是周一到周六
      const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek; // 将周日的0转换为7

      const workflow = workflowMap.get(adjustedDay);
      if (workflow) {
        console.log(`开始执行周${adjustedDay}的工作流...`);
        try {
          await workflow.process();
        } catch (error) {
          console.error(`工作流执行失败:`, error);
        }
      } else {
        console.log(`周${adjustedDay}没有配置对应的工作流`);
      }
    },
    {
      timezone: "Asia/Shanghai",
    }
  );
};
