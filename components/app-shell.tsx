"use client";

import {
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Piano,
  Upload,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./ui/tabs";

const navigation = [
  { value: "library", label: "Library", icon: Library },
  { value: "upload", label: "Upload", icon: Upload },
];

const tools = [{ value: "piano", label: "Piano", icon: Piano }];
const tabs = [...navigation, ...tools];

export function AppShell() {
  const [activeTab, setActiveTab] = useState("library");
  const [collapsed, setCollapsed] = useState(false);
  const activeLabel =
    tabs.find((tab) => tab.value === activeTab)?.label ?? "Library";

  return (
    <Tabs
      className="app-shell"
      data-collapsed={collapsed}
      onValueChange={setActiveTab}
      orientation="vertical"
      value={activeTab}
    >
      <aside className="sidebar">
        <div className="brand">
          <Image
            alt=""
            className="brand-logo"
            height={32}
            priority
            src="/pianogo-logo.png"
            width={32}
          />
          <span className="brand-name">PianoGo</span>
        </div>

        <nav aria-label="Main navigation">
          <div className="navigation-group">
            <span className="navigation-label">Navigation</span>
            <TabsList className="sidebar-tabs-list" variant="line">
              {navigation.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  className="sidebar-tab-trigger"
                  key={value}
                  title={label}
                  value={value}
                >
                  <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
                  <span>{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="navigation-group">
            <span className="navigation-label">Tools</span>
            <TabsList className="sidebar-tabs-list" variant="line">
              {tools.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  className="sidebar-tab-trigger"
                  key={value}
                  title={label}
                  value={value}
                >
                  <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
                  <span>{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </nav>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <Button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="sidebar-toggle"
            onClick={() => setCollapsed((current) => !current)}
            size="icon"
            variant="ghost"
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" size={17} />
            ) : (
              <PanelLeftClose aria-hidden="true" size={17} />
            )}
          </Button>
          <Separator className="topbar-divider" orientation="vertical" />
          <Breadcrumb className="breadcrumb">
            <BreadcrumbList>
              <BreadcrumbItem>Workspace</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{activeLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <main className="workspace">
          {tabs.map(({ value, label }) => (
            <TabsContent
              aria-label={label}
              className="workspace-tab-content"
              key={value}
              value={value}
            />
          ))}
        </main>
      </div>
    </Tabs>
  );
}
