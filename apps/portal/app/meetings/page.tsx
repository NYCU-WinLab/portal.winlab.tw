"use client"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { InfoTab } from "./_components/info-tab"
import { PapersTab } from "./_components/papers-tab"
import { ScheduleTab } from "./_components/schedule-tab"

const CURRENT_YEAR = new Date().getFullYear()

export default function MeetingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-medium">Lab Meetings</h1>
        <p className="text-sm text-muted-foreground">
          WinLab 每週報告排班 — {CURRENT_YEAR}
        </p>
      </div>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">排班表</TabsTrigger>
          <TabsTrigger value="papers">老師 Papers</TabsTrigger>
          <TabsTrigger value="info">Meeting 資訊</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule" className="mt-4">
          <ScheduleTab year={CURRENT_YEAR} />
        </TabsContent>
        <TabsContent value="papers" className="mt-4">
          <PapersTab />
        </TabsContent>
        <TabsContent value="info" className="mt-4">
          <InfoTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
