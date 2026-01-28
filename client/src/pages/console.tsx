import { useState } from "react";
import { ConsoleLayout } from "@/components/console-layout";
import { DailyLogTab } from "@/components/tabs/daily-log";
import { DiveLogsTab } from "@/components/tabs/dive-logs";
import { MasterLogTab } from "@/components/tabs/master-log";
import { DivePlanTab } from "@/components/tabs/dive-plan";
import { LibraryTab } from "@/components/tabs/library";
import { AdminTab } from "@/components/tabs/admin";
import { RiskRegisterTab } from "@/components/tabs/risk-register";

export default function ConsolePage() {
  const [activeTab, setActiveTab] = useState("daily-log");

  const renderTab = () => {
    switch (activeTab) {
      case "daily-log":
        return <DailyLogTab />;
      case "dive-logs":
        return <DiveLogsTab />;
      case "master-log":
        return <MasterLogTab />;
      case "dive-plan":
        return <DivePlanTab />;
      case "library":
        return <LibraryTab />;
      case "admin":
        return <AdminTab />;
      case "risk-register":
        return <RiskRegisterTab />;
      default:
        return <DailyLogTab />;
    }
  };

  return (
    <ConsoleLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderTab()}
    </ConsoleLayout>
  );
}
