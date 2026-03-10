import { useState } from "react";
import { ConsoleLayout } from "@/components/console-layout";
import { DashboardTab } from "@/components/tabs/dashboard";
import { DailyLogTab } from "@/components/tabs/daily-log";
import { DiveLogsTab } from "@/components/tabs/dive-logs";
import { DivePlanTab } from "@/components/tabs/dive-plan";
import { LibraryTab } from "@/components/tabs/library";
import { AdminTab } from "@/components/tabs/admin";
import { RiskRegisterTab } from "@/components/tabs/risk-register";
import { CertificationsTab } from "@/components/tabs/certifications";
import { SafetyTab } from "@/components/tabs/safety";

export default function ConsolePage() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const renderTab = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardTab />;
      case "daily-log":
        return <DailyLogTab />;
      case "dive-logs":
        return <DiveLogsTab />;
      case "dive-plan":
        return <DivePlanTab />;
      case "library":
        return <LibraryTab />;
      case "admin":
        return <AdminTab />;
      case "risk-register":
        return <RiskRegisterTab />;
      case "certifications":
        return <CertificationsTab />;
      case "safety":
        return <SafetyTab />;
      default:
        return <DashboardTab />;
    }
  };

  return (
    <ConsoleLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderTab()}
    </ConsoleLayout>
  );
}
