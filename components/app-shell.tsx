"use client";

import {
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Piano,
  Settings,
  Upload,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Sheet } from "@/lib/library/model";
import { LibraryView } from "./library/library-view";
import { SheetDetailView } from "./library/sheet-detail-view";
import { UploadView } from "./library/upload-view";
import { PianoView } from "./piano/piano-view";
import { useSettings } from "./settings/settings-provider";
import { SettingsView } from "./settings/settings-view";
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
  { value: "library", label: "nav.library", icon: Library },
  { value: "upload", label: "nav.upload", icon: Upload },
] as const;

const tools = [{ value: "piano", label: "nav.piano", icon: Piano }] as const;
const footer = [
  { value: "settings", label: "nav.settings", icon: Settings },
] as const;
const tabs = [...navigation, ...tools, ...footer];

export function AppShell() {
  const { t } = useSettings();
  const [activeTab, setActiveTab] = useState("library");
  const [collapsed, setCollapsed] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<Sheet | null>(null);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadVersion = useRef(0);
  const activeLabel = t(
    tabs.find((tab) => tab.value === activeTab)?.label ?? "nav.library",
  );

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
        setLoadFailed(false);
        setSheets(rows);
      })
      .catch(() => {
        if (version !== loadVersion.current) return;
        setLoadFailed(true);
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

        <nav aria-label={t("nav.mainNavigation")} className="sidebar-nav">
          <div className="navigation-group">
            <span className="navigation-label">{t("nav.navigation")}</span>
            <TabsList className="sidebar-tabs-list" variant="line">
              {navigation.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  className="sidebar-tab-trigger"
                  key={value}
                  title={t(label)}
                  value={value}
                >
                  <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
                  <span>{t(label)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="navigation-group">
            <span className="navigation-label">{t("nav.tools")}</span>
            <TabsList className="sidebar-tabs-list" variant="line">
              {tools.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  className="sidebar-tab-trigger"
                  key={value}
                  title={t(label)}
                  value={value}
                >
                  <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
                  <span>{t(label)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="sidebar-footer">
            <TabsList className="sidebar-tabs-list" variant="line">
              {footer.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  className="sidebar-tab-trigger"
                  key={value}
                  title={t(label)}
                  value={value}
                >
                  <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
                  <span>{t(label)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </nav>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <Button
            aria-label={
              collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")
            }
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
              <BreadcrumbItem>{t("nav.workspace")}</BreadcrumbItem>
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
              aria-label={t(label)}
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
                  loadError={loadFailed ? t("nav.loadError") : ""}
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
              {value === "settings" ? <SettingsView /> : null}
            </TabsContent>
          ))}
        </main>
      </div>
    </Tabs>
  );
}
