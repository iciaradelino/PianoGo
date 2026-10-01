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
import type { Sheet, SheetDraft } from "@/lib/library/model";
import { LibraryView } from "./library/library-view";
import { SheetDetailView } from "./library/sheet-detail-view";
import { UploadView } from "./library/upload-view";
import { PianoView } from "./piano/piano-view";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { Button } from "./ui/button";
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

type AppShellProps = {
  initialSheets: Sheet[];
};

export function AppShell({ initialSheets }: AppShellProps) {
  const [activeTab, setActiveTab] = useState("library");
  const [collapsed, setCollapsed] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<Sheet | null>(null);
  const [sheets, setSheets] = useState(initialSheets);
  const activeLabel =
    tabs.find((tab) => tab.value === activeTab)?.label ?? "Library";

  function handleTabChange(value: string) {
    setActiveTab(value);
    setSelectedSheet(null);
  }

  async function handleAddSheet(draft: SheetDraft) {
    const formData = new FormData();
    formData.set("title", draft.title);
    formData.set("composer", draft.composer);
    formData.set("difficulty", draft.difficulty);
    formData.set("file", draft.file);

    const response = await fetch("/api/sheets", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json()) as Sheet | { error?: string };

    if (!response.ok) {
      throw new Error(
        "error" in result && result.error
          ? result.error
          : "The sheet could not be saved.",
      );
    }

    setSheets((current) => [result as Sheet, ...current]);
  }

  function handleOpenInPiano() {
    setActiveTab("piano");
  }

  return (
    <Tabs
      className="app-shell"
      data-collapsed={collapsed}
      onValueChange={handleTabChange}
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
            src="/pianogo-logo.svg?v=2"
            unoptimized
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
          <Breadcrumb className="breadcrumb">
            <BreadcrumbList>
              <BreadcrumbItem>Workspace</BreadcrumbItem>
              <BreadcrumbSeparator />
              {selectedSheet ? (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <button
                        className="breadcrumb-button"
                        onClick={() => setSelectedSheet(null)}
                        type="button"
                      >
                        {activeLabel}
                      </button>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{selectedSheet.title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              ) : (
                <BreadcrumbItem>
                  <BreadcrumbPage>{activeLabel}</BreadcrumbPage>
                </BreadcrumbItem>
              )}
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
            >
              {value === "library" && selectedSheet ? (
                <SheetDetailView
                  onBack={() => setSelectedSheet(null)}
                  onOpenInPiano={handleOpenInPiano}
                  sheet={selectedSheet}
                />
              ) : null}
              {value === "library" && !selectedSheet ? (
                <LibraryView onSelectSheet={setSelectedSheet} sheets={sheets} />
              ) : null}
              {value === "upload" ? (
                <UploadView
                  onAddSheet={handleAddSheet}
                  onOpenLibrary={() => handleTabChange("library")}
                />
              ) : null}
              {value === "piano" ? <PianoView sheet={selectedSheet} /> : null}
            </TabsContent>
          ))}
        </main>
      </div>
    </Tabs>
  );
}
