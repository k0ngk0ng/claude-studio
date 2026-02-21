/**
 * Remote Control screen — main interface when controlling a desktop.
 * Shows chat messages, allows sending, session switching, and basic git ops.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRemoteStore } from '../stores/remoteStore';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';
import type { Message } from '../types';

type Tab = 'chat' | 'sessions';

interface Props {
  onBack: () => void;
}

export function RemoteControlScreen({ onBack }: Props) {
  const {
    controllingDesktopName,
    messages,
    isStreaming,
    sessions,
    currentSessionId,
    sendMessage,
    loadSessions,
    selectSession,
    startNewChat,
    executeCommand,
    releaseDesktop,
  } = useRemoteStore();

  const [activeTab, setActiveTab] = useState<Tab>('sessions');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Get current session's project path
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const projectPath = currentSession?.projectPath || null;

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);
    await sendMessage(text);
    setSending(false);
  };

  const handleBack = () => {
    releaseDesktop();
    onBack();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {controllingDesktopName || 'Desktop'}
          </Text>
          <View style={styles.controlBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.controlText}>Controlling</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['sessions', 'chat'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => {
              setActiveTab(tab);
              if (tab === 'sessions') loadSessions();
            }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'sessions' ? 'Sessions' : tab === 'chat' ? 'Chat' : 'Git'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content — keep ChatTab mounted to preserve scroll position */}
      <View style={{ flex: 1, display: activeTab === 'chat' ? 'flex' : 'none' }}>
        <ChatTab
          messages={messages}
          input={input}
          setInput={setInput}
          onSend={handleSend}
          sending={sending}
          isStreaming={isStreaming}
          flatListRef={flatListRef}
          projectPath={projectPath}
          onNewChat={startNewChat}
          hasCurrentSession={!!currentSessionId}
        />
      </View>
      {activeTab === 'sessions' && (
        <SessionsTab
          sessions={sessions}
          onSelect={async (id) => {
            try {
              await selectSession(id);
              setActiveTab('chat');
            } catch (err: any) {
              if (err?.message === 'CONNECTION_FAILED') {
                Alert.alert(
                  'Connection Failed',
                  'Unable to connect to desktop. The encryption keys may be out of sync. Please go back and try reconnecting.',
                  [{ text: 'OK' }],
                );
              }
            }
          }}
        />
      )}
    </View>
  );
}

// ─── Chat Tab ────────────────────────────────────────────────────────

function ChatTab({
  messages,
  input,
  setInput,
  onSend,
  sending,
  isStreaming,
  flatListRef,
  projectPath,
  onNewChat,
  hasCurrentSession,
}: {
  messages: Message[];
  input: string;
  setInput: (s: string) => void;
  onSend: () => void;
  sending: boolean;
  isStreaming: boolean;
  flatListRef: React.RefObject<FlatList>;
  projectPath: string | null;
  onNewChat: () => void;
  hasCurrentSession: boolean;
}) {
  // Show only the last 2 path segments for brevity (e.g. "org/repo")
  const shortPath = projectPath
    ? projectPath.split('/').filter(Boolean).slice(-2).join('/')
    : null;

  return (
    <KeyboardAvoidingView
      style={styles.chatContainer}
      behavior="padding"
    >
      <View style={{ flex: 1 }}>
      {/* Project path bar */}
      {shortPath && (
        <View style={styles.projectBar}>
          <Text style={styles.projectIcon}>📁</Text>
          <Text style={styles.projectPath} numberOfLines={1}>{shortPath}</Text>
          {!hasCurrentSession && (
            <TouchableOpacity onPress={onNewChat} style={styles.newThreadBtn}>
              <Text style={styles.newThreadBtnText}>New Thread</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => <MessageBubble message={item} />}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatText}>Send a message to start</Text>
          </View>
        }
      />

      {/* Streaming indicator */}
      {isStreaming && (
        <View style={styles.streamingBar}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.streamingText}>Thinking…</Text>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="Message…"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={10000}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={!input.trim() || sending}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : isSystem ? styles.systemBubble : styles.assistantBubble]}>
      {!isUser && (
        <Text style={styles.roleLabel}>
          {isSystem ? 'System' : 'Claude'}
        </Text>
      )}
      <Text style={[styles.messageText, isSystem && styles.systemText]}>
        {message.content}
      </Text>
    </View>
  );
}

// ─── Sessions Tab ────────────────────────────────────────────────────

function SessionsTab({
  sessions,
  onSelect,
}: {
  sessions: any[];
  onSelect: (id: string) => void;
}) {
  return (
    <FlatList
      data={sessions}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.sessionList}
      ListEmptyComponent={
        <View style={styles.emptyChat}>
          <Text style={styles.emptyChatText}>No sessions found</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.sessionCard}
          onPress={() => onSelect(item.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.sessionTitle} numberOfLines={1}>
            {item.title || 'Untitled'}
          </Text>
          <Text style={styles.sessionMeta} numberOfLines={1}>
            {item.lastMessage || item.timestamp || ''}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

// ─── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.sidebar,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    fontSize: fontSize.xl,
    color: colors.textPrimary,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  controlBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  controlText: {
    fontSize: fontSize.xs,
    color: colors.success,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.accent,
  },
  chatContainer: {
    flex: 1,
  },
  projectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  projectIcon: {
    fontSize: 12,
  },
  projectPath: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    flex: 1,
  },
  newThreadBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  newThreadBtnText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  messageList: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  bubble: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    maxWidth: '85%',
    marginBottom: spacing.sm,
  },
  userBubble: {
    backgroundColor: colors.userBubble,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: colors.assistantBubble,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  systemBubble: {
    backgroundColor: colors.surface,
    alignSelf: 'center',
    borderRadius: borderRadius.sm,
  },
  roleLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: 4,
    fontWeight: '600',
  },
  messageText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  systemText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyChatText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  streamingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  streamingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.sidebar,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.surface,
  },
  sendBtnText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  sessionList: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sessionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  sessionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sessionMeta: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 4,
  },
});
