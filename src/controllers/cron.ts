import cron from "node-cron";
import { WeixinWorkflow } from "../services/weixin-article.workflow";
import { Workflow } from "../services/interfaces/workflow.interface";
import { WeixinAIBenchWorkflow } from "../services/weixin-aibench.workflow";
import { WeixinHelloGithubWorkflow } from "../services/weixin-hellogithub.workflow";
import { PaperWorkflow } from "../services/paper.workflow";
import { HFPaperWorkflow } from "../services/hfpaper.workflow";
import { HFPaperWeeklyWorkflow } from "../services/hfpaper-weekly.workflow";

// 工作流映射表，用于存储不同日期对应的工作流数组
const workflowMap = new Map<number, Workflow[]>();

// 初始化工作流映射
const initializeWorkflows = () => {
  // 初始化每个日期的工作流数组
  for (let i = 1; i <= 7; i++) {
    workflowMap.set(i, []);
  }

  // 周一的工作流 (1)
  // workflowMap.get(1)?.push(new WeixinWorkflow());
  workflowMap.get(1)?.push(new HFPaperWorkflow());
  
  // 周二的工作流 (2)
  // workflowMap.get(2)?.push(newt
  //  WeixinAIBenchWorkflow());
  // workflowMap.get(2)?.push(new PaperWorkflow());
  workflowMap.get(2)?.push(new HFPaperWorkflow());
  
  // 周三的工作流 (3)
  // workflowMap.get(3)?.push(new WeixinHelloGithubWorkflow());
  workflowMap.get(3)?.push(new HFPaperWorkflow());
  
  // 周四的工作流 (4)
  // workflowMap.get(4)?.push(new WeixinWorkflow());
  workflowMap.get(4)?.push(new HFPaperWorkflow());
  
  // 周五的工作流 (5)
  // workflowMap.get(5)?.push(new WeixinWorkflow());
  workflowMap.get(5)?.push(new HFPaperWorkflow());
  
  // 周六的工作流 (6)

  workflowMap.get(6)?.push(new HFPaperWeeklyWorkflow());
  
  // 周日的工作流 (7)

  // workflowMap.get(7)?.push(new HFPaperWorkflow());

};

// 执行工作流的函数
const executeWorkflow = async () => {
  try {
    // 获取当前是星期几（1-7，其中1表示星期一）
    const currentDay = new Date().getDay() || 7; // getDay返回0-6，0表示星期日
    
    console.log(`开始执行星期${currentDay}的工作流程...`);
    
    // 获取当天需要执行的工作流
    const workflows = workflowMap.get(currentDay) || [];
    
    if (workflows.length === 0) {
      console.log(`星期${currentDay}没有需要执行的工作流`);
      return;
    }
    
    // 按顺序执行所有工作流
    for (const workflow of workflows) {
      console.log(`执行工作流: ${workflow.constructor.name}`);
      try {
        await workflow.process();
        console.log(`工作流 ${workflow.constructor.name} 执行完成`);
      } catch (error) {
        console.error(`工作流 ${workflow.constructor.name} 执行失败:`, error);
      }
    }
    
    console.log(`星期${currentDay}的所有工作流执行完毕`);
  } catch (error) {
    console.error("工作流执行过程中出错:", error);
  }
};

// 初始化并启动定时任务
export const initCronJobs = () => {
  // 初始化工作流
  initializeWorkflows();
  
  // 每天19点执行
  cron.schedule("0 19 * * *", () => {
    executeWorkflow();
  });
  
  console.log("定时任务已初始化，将在每天18点执行");
};

// 添加此函数以保持向后兼容性
export const startCronJobs = async () => {
  console.log("使用 startCronJobs 函数已被弃用，请使用 initCronJobs 函数");
  initCronJobs();
};
