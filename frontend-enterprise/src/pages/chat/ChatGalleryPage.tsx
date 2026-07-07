import { type CSSProperties } from 'react';

import AppSidebar from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { getEnterpriseAuthSession, isEnterpriseAdmin } from '@/auth';

import EmployeeGalleryPage from '../EmployeeGalleryPage';
import { sessionHasUnreadReply } from './chatHelpers';
import { useChatSession } from './useChatSession';
import ChatDialogs from './components/ChatDialogs';

export default function ChatGalleryPage() {
  const chat = useChatSession();
  const auth = getEnterpriseAuthSession();
  const isAdmin = isEnterpriseAdmin(auth?.user);

  return (
    <SidebarProvider
      open={!chat.sidebarCollapsed}
      onOpenChange={(open) => {
        if (open === chat.sidebarCollapsed) chat.toggleSidebar();
      }}
      style={
        {
          '--sidebar-width': '220px',
          '--sidebar-width-icon': '72px',
        } as CSSProperties
      }
      className="h-screen min-h-0 bg-[#fcfcfc] text-[#18181a]"
    >
      <AppSidebar
        variant="chat"
        sessions={chat.visibleSidebarSessions}
        sessionsLoading={chat.sessionsLoading}
        agents={chat.agents}
        activeSessionId={chat.sessionId}
        sessionFilter={chat.sessionAgentFilter}
        onSessionFilterChange={chat.setSessionAgentFilter}
        sessionFilterOptions={chat.sessionFilterOptions}
        isSessionUnread={(session) => sessionHasUnreadReply(session, chat.sessionReadTimes, chat.sessionId)}
        onOpenSession={chat.openSession}
        onOpenGallery={chat.openGallery}
        galleryActive
        handoffCount={chat.handoffs.length}
        onOpenHandoffs={chat.openHandoffInbox}
        onRenameSession={chat.openRename}
        onDeleteSession={chat.requestDelete}
        onOpenAdmin={chat.openAdmin}
      />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <EmployeeGalleryPage
          currentUser={auth?.user}
          isAdmin={isAdmin}
          onLogout={chat.logout}
        />
      </main>
      <ChatDialogs chat={chat} />
    </SidebarProvider>
  );
}
