"use client";

import {
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Piano,
  Upload,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Sheet } from "@/lib/library/model";
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

export function AppShell() {
  const [activeTab, setActiveTab] = useState("library");
  const [collapsed, setCollapsed] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<Sheet | null>(null);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const loadVersion = useRef(0);
  const activeLabel =
    tabs.find((tab) => tab.value === activeTab)?.label ?? "Library";

  function handleTabChange(value: string) {
    setActiveTab(value);
    setSelectedSheet(null);
  }

  function handleOpenInPiano() {
    setActiveTab("piano");
  }

  const loadSheets = useCallback(() => {
    const version = ++loadVersion.current;

    fetch("/api/sheets")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load sheets.");
        return (await response.json()) as Sheet[];
      })
      .then((rows) => {
        if (version !== loadVersion.current) return;
        setLoadError("");
        setSheets(rows);
      })
      .catch(() => {
        if (version !== loadVersion.current) return;
        setLoadError("Could not load sheets.");
        setSheets([]);
      });
  }, []);

  useEffect(() => {
    loadSheets();
  }, [loadSheets]);

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
                  onDelete={(id) => {
                    setSelectedSheet(null);
                    setSheets(
                      (current) =>
                        current?.filter((sheet) => sheet.id !== id) ?? current,
                    );
                  }}
                  onUpdate={(next) => {
                    setSelectedSheet(next);
                    setSheets(
                      (current) =>
                        current?.map((sheet) =>
                          sheet.id === next.id ? next : sheet,
                        ) ?? current,
                    );
                  }}
                  onOpenInPiano={handleOpenInPiano}
                  sheet={selectedSheet}
                />
              ) : null}
              {value === "library" && !selectedSheet && sheets ? (
                <LibraryView
                  loadError={loadError}
                  onSelectSheet={setSelectedSheet}
                  sheets={sheets}
                />
              ) : null}
              {value === "upload" ? (
                <UploadView
                  onOpenLibrary={() => handleTabChange("library")}
                  onUploaded={() => {
                    void loadSheets();
                  }}
                />
              ) : null}
              {value === "piano" ? (
                <PianoView
                  onOpenSheet={setSelectedSheet}
                  sheet={selectedSheet}
                  sheets={sheets ?? []}
                />
              ) : null}
            </TabsContent>
          ))}
        </main>
      </div>
    </Tabs>
  );
}
