import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  UserPlus,
  Users,
  MessageCircle,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Phone,
  MapPin,
  Activity,
  Send,
  Clock,
  Sparkles,
  Loader,
  Stethoscope,
  Link2,
  Trash2,
  RefreshCw,
  MessageSquare,
  QrCode,
  ExternalLink,
  Pencil,
  Wrench,
  Database,
  Bot,
  CalendarClock,
  Wifi,
  KeyRound,
  ShieldCheck,
  History,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';

// --- Types ---
type HealthStatus = '良好' | '慢性病' | '行動不便' | '需定期回診' | '其他';
type SeniorStatus = 'green' | 'yellow' | 'red' | 'gray';

const LINE_OFFICIAL_ACCOUNT_ID = '@833zhchh';
const LINE_ADD_FRIEND_URL = `https://line.me/R/ti/p/${LINE_OFFICIAL_ACCOUNT_ID}`;
const LINE_QR_CODE_URL = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&data=${encodeURIComponent(LINE_ADD_FRIEND_URL)}`;
const REPORT_OVERDUE_MS = 24 * 60 * 60 * 1000;

interface SeniorRow {
  id: number;
  name: string;
  phone: string;
  address: string;
  health: HealthStatus;
  healthNote: string | null;
  lineUserId: string | null;
  lineDisplayName: string | null;
  status: SeniorStatus;
  lastReportTime: number | null;
  messageSentTime: number | null;
}

interface MessageRow {
  id: number;
  seniorId: number;
  direction: 'outbound' | 'inbound';
  messageText: string;
  lineMessageId: string | null;
  sentAt: number;
}

// --- Components ---
const isReportOverdue = (senior: SeniorRow, now = Date.now()) => {
  if (!senior.lineUserId) return false;
  if (senior.lastReportTime) return now - senior.lastReportTime > REPORT_OVERDUE_MS;
  if (senior.messageSentTime) return now - senior.messageSentTime > REPORT_OVERDUE_MS;
  return false;
};

const StatusBadge = ({ status, overdue }: { status: SeniorStatus; overdue?: boolean }) => {
  if (overdue) {
    return (
      <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-bold">
        <XCircle size={16} /> 超時未回報
      </span>
    );
  }

  switch (status) {
    case 'green':
      return (
        <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-bold">
          <CheckCircle size={16} /> 平安 (綠燈)
        </span>
      );
    case 'yellow':
      return (
        <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-sm font-bold">
          <AlertTriangle size={16} /> 關注 (黃燈)
        </span>
      );
    case 'red':
      return (
        <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-bold">
          <XCircle size={16} /> 緊急 (紅燈)
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-gray-500 text-sm font-bold">
          <Clock size={16} /> 待發送
        </span>
      );
  }
};

const toneClass = {
  green: 'bg-green-50 text-green-700 border-green-200',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  gray: 'bg-gray-50 text-gray-600 border-gray-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
} as const;

const SystemStatusItem = ({
  icon,
  label,
  value,
  tone,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: keyof typeof toneClass;
  detail?: string | null;
}) => (
  <div className={`rounded-lg border p-3 ${toneClass[tone]}`}>
    <div className="flex items-center gap-2 text-xs font-bold">
      {icon}
      <span>{label}</span>
    </div>
    <div className="mt-1 text-sm font-bold text-gray-800">{value}</div>
    {detail && <div className="mt-0.5 text-[11px] opacity-75 break-all">{detail}</div>}
  </div>
);

const formatDailyGreetingTime = (hour: number, timeZone: string) =>
  `${String(hour).padStart(2, '0')}:00 ${timeZone}`;

const SystemStatusPanel = ({
  status,
}: {
  status?: {
    storage: { label: string; path: string | null };
    gemini: { configured: boolean; label: string };
    line: {
      pushConfigured: boolean;
      webhookConfigured: boolean;
      channelIdConfigured: boolean;
      webhookEndpoint: string;
    };
    dailyGreeting: { enabled: boolean; hour: number; timeZone: string };
    auth: { configured: boolean };
    localTestTools: { enabled: boolean };
  };
}) => {
  if (!status) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader className="animate-spin" size={16} />
          <span className="text-sm font-medium">系統狀態載入中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
          <ShieldCheck size={18} className="text-orange-600" /> 系統狀態
        </h2>
        <span className="text-xs text-gray-400">目前執行環境</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <SystemStatusItem
          icon={<Database size={15} />}
          label="資料"
          value={status.storage.label}
          tone={status.storage.path ? 'blue' : 'green'}
          detail={status.storage.path}
        />
        <SystemStatusItem
          icon={<Bot size={15} />}
          label="Gemini"
          value={status.gemini.label}
          tone={status.gemini.configured ? 'green' : 'yellow'}
        />
        <SystemStatusItem
          icon={<Wifi size={15} />}
          label="Line 發送"
          value={status.line.pushConfigured ? '可發送' : '未設定'}
          tone={status.line.pushConfigured ? 'green' : 'yellow'}
          detail={status.line.channelIdConfigured ? 'Channel ID 已設定' : 'Channel ID 未設定'}
        />
        <SystemStatusItem
          icon={<KeyRound size={15} />}
          label="Webhook"
          value={status.line.webhookConfigured ? '可驗證' : '未設定'}
          tone={status.line.webhookConfigured ? 'green' : 'yellow'}
          detail={status.line.webhookEndpoint}
        />
        <SystemStatusItem
          icon={<CalendarClock size={15} />}
          label="每日問候"
          value={
            status.dailyGreeting.enabled
              ? formatDailyGreetingTime(status.dailyGreeting.hour, status.dailyGreeting.timeZone)
              : '手動'
          }
          tone={status.dailyGreeting.enabled ? 'green' : 'blue'}
          detail={status.dailyGreeting.enabled ? '自動排程啟用' : '排程停用，可手動發送'}
        />
        <SystemStatusItem
          icon={<Wrench size={15} />}
          label="測試工具"
          value={status.localTestTools.enabled ? '本機可用' : '正式隱藏'}
          tone={status.localTestTools.enabled ? 'blue' : 'gray'}
          detail={status.auth.configured ? '登入已設定' : '本機免登入'}
        />
      </div>
    </div>
  );
};

export default function Home() {
  const utils = trpc.useUtils();
  const [historySenior, setHistorySenior] = useState<SeniorRow | null>(null);
  const { data: seniors = [], isLoading } = trpc.senior.list.useQuery();
  const { data: systemStatus } = trpc.system.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const {
    data: historyMessages = [],
    isLoading: historyLoading,
  } = trpc.senior.getMessages.useQuery(
    { seniorId: historySenior?.id || 0 },
    {
      enabled: Boolean(historySenior),
      refetchOnWindowFocus: false,
    }
  );
  const now = Date.now();
  const localTestToolsVisible =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const { data: dailyGreetingPreview, refetch: refetchDailyGreetingPreview } =
    trpc.senior.devDailyGreetingPreview.useQuery(undefined, {
      enabled: localTestToolsVisible,
      refetchOnWindowFocus: false,
    });

  const createSenior = trpc.senior.create.useMutation({
    onSuccess: () => {
      utils.senior.list.invalidate();
      setActiveTab('dashboard');
      setNewName(''); setNewPhone(''); setNewAddress(''); setNewHealth('良好'); setNewHealthNote('');
      toast.success('長者資料已新增！');
    },
    onError: (e) => toast.error(`新增失敗：${e.message}`),
  });

  const updateStatus = trpc.senior.updateStatus.useMutation({
    onSuccess: () => utils.senior.list.invalidate(),
    onError: (e) => toast.error(`更新失敗：${e.message}`),
  });

  const deleteSenior = trpc.senior.delete.useMutation({
    onSuccess: () => { utils.senior.list.invalidate(); toast.success('已刪除長者資料'); },
    onError: (e) => toast.error(`刪除失敗：${e.message}`),
  });

  const sendLineMutation = trpc.senior.sendLineMessage.useMutation({
    onSuccess: (data) => {
      utils.senior.list.invalidate();
      utils.senior.getMessages.invalidate();
      if (data.simulated) {
        setSimulationMsg(data.simulatedMessage || '');
        setShowSimulateModal(true);
      } else if (data.success) {
        toast.success('Line 訊息已成功發送！');
      } else {
        toast.error(`發送失敗：${data.error}`);
      }
      setShowComposeModal(false);
    },
    onError: (e) => toast.error(`發送失敗：${e.message}`),
  });

  const reportSafe = trpc.senior.reportSafe.useMutation({
    onSuccess: () => { utils.senior.list.invalidate(); utils.senior.getMessages.invalidate(); setShowSimulateModal(false); toast.success('已回報平安！'); },
  });

  const { data: pendingLineUsers = [] } = trpc.senior.getPendingLineUsers.useQuery(undefined, {
    refetchInterval: 5000, // 每 5 秒自動刷新
  });

  const bindLine = trpc.senior.update.useMutation({
    onSuccess: () => { utils.senior.list.invalidate(); setShowBindModal(false); toast.success('Line 帳號綁定成功！'); },
    onError: (e) => toast.error(`綁定失敗：${e.message}`),
  });

  const updateSenior = trpc.senior.update.useMutation({
    onSuccess: () => {
      utils.senior.list.invalidate();
      setShowEditModal(false);
      setEditTargetId(null);
      toast.success('長者資料已更新！');
    },
    onError: (e) => toast.error(`更新失敗：${e.message}`),
  });

  const devScenario = trpc.senior.devScenario.useMutation({
    onSuccess: () => {
      utils.senior.list.invalidate();
      refetchDailyGreetingPreview();
      toast.success('測試情境已套用');
    },
    onError: (e) => toast.error(`測試工具失敗：${e.message}`),
  });

  const simulateLineWebhookFollow = trpc.senior.devSimulateLineWebhookFollow.useMutation({
    onSuccess: (data) => {
      setWebhookTestResult(data);
      utils.senior.getPendingLineUsers.invalidate();
      toast.success('Line Webhook follow 測試已加入待綁定清單');
    },
    onError: (e) => toast.error(`Webhook 驗證失敗：${e.message}`),
  });

  const createReportLink = trpc.senior.devCreateReportLink.useMutation({
    onSuccess: (data) => {
      setReportLinkTestResult(data);
      utils.senior.list.invalidate();
      utils.senior.getMessages.invalidate();
      toast.success('本機平安回報連結已產生');
    },
    onError: (e) => toast.error(`產生回報連結失敗：${e.message}`),
  });

  const generateAiText = trpc.senior.generateAiText.useMutation();

  // UI States
  const [activeTab, setActiveTab] = useState<'dashboard' | 'add' | 'line'>('dashboard');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newHealth, setNewHealth] = useState<HealthStatus>('良好');
  const [newHealthNote, setNewHealthNote] = useState('');

  const [showEditModal, setShowEditModal] = useState(false);
  const [editTargetId, setEditTargetId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editHealth, setEditHealth] = useState<HealthStatus>('良好');
  const [editHealthNote, setEditHealthNote] = useState('');

  const [showComposeModal, setShowComposeModal] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [currentComposeId, setCurrentComposeId] = useState<number | null>(null);
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);

  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [simulationMsg, setSimulationMsg] = useState('');
  const [simulatingId, setSimulatingId] = useState<number | null>(null);

  const [showBindModal, setShowBindModal] = useState(false);
  const [bindTargetId, setBindTargetId] = useState<number | null>(null);
  const [bindLineUserId, setBindLineUserId] = useState('');
  const [bindLineDisplayName, setBindLineDisplayName] = useState('');

  const [adviceMap, setAdviceMap] = useState<Record<number, string>>({});
  const [loadingAdviceId, setLoadingAdviceId] = useState<number | null>(null);
  const [webhookTestResult, setWebhookTestResult] = useState<null | {
    lineUserId: string;
    displayName: string;
    webhookEndpoint: string;
    signatureConfigured: boolean;
    result: {
      processed: number;
      followEvents: number;
      pendingUsersAdded: number;
    };
  }>(null);
  const [reportLinkTestResult, setReportLinkTestResult] = useState<null | {
    seniorId: number;
    seniorName: string;
    reportToken: string;
    reportUrl: string;
  }>(null);

  // --- Actions ---
  const handleAddSenior = (e: React.FormEvent) => {
    e.preventDefault();
    createSenior.mutate({ name: newName, phone: newPhone, address: newAddress, health: newHealth, healthNote: newHealthNote });
  };

  const openEditSenior = (senior: SeniorRow) => {
    setEditTargetId(senior.id);
    setEditName(senior.name);
    setEditPhone(senior.phone);
    setEditAddress(senior.address);
    setEditHealth(senior.health);
    setEditHealthNote(senior.healthNote || '');
    setShowEditModal(true);
  };

  const handleEditSenior = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTargetId) return;
    updateSenior.mutate({
      id: editTargetId,
      name: editName,
      phone: editPhone,
      address: editAddress,
      health: editHealth,
      healthNote: editHealthNote,
    });
  };

  const initiateSend = (senior: SeniorRow, messageOverride?: string) => {
    const hour = new Date().getHours();
    let timeGreeting = '早安';
    if (hour >= 11 && hour < 14) timeGreeting = '午安';
    if (hour >= 18) timeGreeting = '晚安';
    const defaultMsg = messageOverride || `${timeGreeting}，${senior.name}！最近身體好嗎？\n請點擊下方按鈕回報平安。`;
    setComposeText(defaultMsg);
    setCurrentComposeId(senior.id);
    setSimulatingId(senior.id);
    setShowComposeModal(true);
  };

  const initiateEmergencyCare = (senior: SeniorRow) => {
    initiateSend(
      senior,
      `${senior.name}，我們發現您已經超過一天沒有回報平安，有點擔心您。\n如果方便，請點擊下方按鈕回報；若身體不舒服，請直接回覆「我需要幫助」。`
    );
  };

  const handleGenerateGreeting = async () => {
    if (!currentComposeId) return;
    const senior = seniors.find(s => s.id === currentComposeId) as SeniorRow | undefined;
    if (!senior) return;
    setIsGeneratingMessage(true);
    try {
      const hour = new Date().getHours();
      let timeOfDay = '早上';
      if (hour >= 11 && hour < 14) timeOfDay = '中午';
      if (hour >= 18) timeOfDay = '晚上';
      const prompt = `請為一位名叫「${senior.name}」的長者生成一則溫暖的 Line 問候訊息。情境：${timeOfDay}問候。長者健康狀況：${senior.health} (${senior.healthNote || '無特殊備註'})。要求：1. 語氣要非常親切、溫暖，像晚輩對長輩的關心。2. 內容不超過 60 字。3. 根據健康狀況加入一句貼心提醒。4. 最後不用加「請點擊連結」。5. 使用繁體中文。`;
      const generated = await generateAiText.mutateAsync({ prompt, fallbackType: 'greeting' });
      setComposeText(generated.text.trim());
      if (generated.source === 'fallback') {
        toast.warning('Gemini 尚未啟用，已使用本機範本');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI 生成失敗');
    } finally {
      setIsGeneratingMessage(false);
    }
  };

  const finalizeSend = () => {
    if (!currentComposeId) return;
    sendLineMutation.mutate({
      seniorId: currentComposeId,
      messageText: composeText,
      appBaseUrl: window.location.origin,
    });
  };

  const handleGetAdvice = async (senior: SeniorRow) => {
    if (adviceMap[senior.id]) {
      const newMap = { ...adviceMap };
      delete newMap[senior.id];
      setAdviceMap(newMap);
      return;
    }
    setLoadingAdviceId(senior.id);
    try {
      const prompt = `我是一位關懷獨居長者的志工。請針對以下長者狀況，提供 3 點具體、簡短的「探視/關懷注意事項」。長者：${senior.name}。主要狀況：${senior.health}。備註：${senior.healthNote || '無'}。格式：• 建議一\n• 建議二\n• 建議三。語氣專業但易懂，繁體中文。`;
      const advice = await generateAiText.mutateAsync({ prompt, fallbackType: 'advice' });
      setAdviceMap(prev => ({ ...prev, [senior.id]: advice.text }));
      if (advice.source === 'fallback') {
        toast.warning('Gemini 尚未啟用，已使用本機範本');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI 生成失敗');
    } finally {
      setLoadingAdviceId(null);
    }
  };

  const handleBindLine = (id: number) => {
    setBindTargetId(id);
    setBindLineUserId('');
    setBindLineDisplayName('');
    setShowBindModal(true);
  };

  const isValidLineUserId = (id: string) => /^U[0-9a-f]{32}$/.test(id.trim());

  const confirmBindLine = () => {
    if (!bindTargetId || !bindLineUserId.trim()) return;
    bindLine.mutate({ id: bindTargetId, lineUserId: bindLineUserId.trim(), lineDisplayName: bindLineDisplayName.trim() || undefined });
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return null;
    return new Date(ts).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatFullTime = (ts: number) =>
    new Date(ts).toLocaleString('zh-TW', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 pb-20 md:pb-0">

      {/* Header */}
      <header className="bg-orange-600 text-white p-4 shadow-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="animate-pulse" />
            <h1 className="text-xl font-bold">獨居前賢關懷小組 App</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs bg-orange-700 px-2 py-1 rounded">值班中</div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto p-4">

        {/* Dashboard View */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">

            {/* Quick Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('line')}
                className="flex-1 bg-white border border-green-200 text-green-700 px-4 py-3 rounded-lg font-bold hover:bg-green-50 flex items-center justify-center gap-2 shadow-sm"
              >
                <QrCode size={20} /> Line 加好友 QR Code
              </button>
            </div>

            <SystemStatusPanel status={systemStatus} />

            {/* Stats Summary */}
            <div className="grid grid-cols-4 gap-2 text-center mb-6">
              <div className="bg-white p-3 rounded-lg shadow-sm border-t-4 border-green-500">
                <div className="text-2xl font-bold text-green-600">
                  {(seniors as SeniorRow[]).filter(s => s.status === 'green').length}
                </div>
                <div className="text-xs text-gray-500">平安</div>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm border-t-4 border-yellow-500">
                <div className="text-2xl font-bold text-yellow-600">
                  {(seniors as SeniorRow[]).filter(s => s.status === 'yellow').length}
                </div>
                <div className="text-xs text-gray-500">關注</div>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm border-t-4 border-red-500">
                <div className="text-2xl font-bold text-red-600">
                  {(seniors as SeniorRow[]).filter(s => s.status === 'red' || isReportOverdue(s, now)).length}
                </div>
                <div className="text-xs text-gray-500">緊急/逾時</div>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm border-t-4 border-blue-500">
                <div className="text-2xl font-bold text-blue-600">
                  {(seniors as SeniorRow[]).filter(s => s.lineUserId).length}
                </div>
                <div className="text-xs text-gray-500">已綁 Line</div>
              </div>
            </div>

            {localTestToolsVisible && !isLoading && (
              <div className="bg-white border border-dashed border-orange-300 rounded-xl p-4 shadow-sm space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-gray-800 flex items-center gap-2">
                      <Wrench size={18} className="text-orange-600" /> 本機測試工具
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">只在 localhost 顯示，不會真的發送 Line。</p>
                  </div>
                  <button
                    onClick={() => refetchDailyGreetingPreview()}
                    className="text-xs px-3 py-2 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 font-bold"
                  >
                    更新預覽
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="border border-green-100 bg-green-50 rounded-lg p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-sm text-green-800 flex items-center gap-2">
                          <ShieldCheck size={16} /> Line Webhook 綁定驗證
                        </div>
                        <p className="text-xs text-green-700 mt-1">
                          模擬長者加入好友的 follow webhook，確認會進入待綁定清單。
                        </p>
                      </div>
                      <button
                        onClick={() => simulateLineWebhookFollow.mutate()}
                        disabled={simulateLineWebhookFollow.isPending}
                        className="px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        {simulateLineWebhookFollow.isPending ? (
                          <Loader className="animate-spin" size={14} />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        執行驗證
                      </button>
                    </div>

                    {webhookTestResult && (
                      <div className="bg-white border border-green-100 rounded-lg p-3 text-xs text-gray-700 space-y-1">
                        <div>
                          <span className="font-bold text-gray-800">測試用戶：</span>
                          {webhookTestResult.displayName}
                        </div>
                        <div className="font-mono break-all text-gray-500">{webhookTestResult.lineUserId}</div>
                        <div>
                          <span className="font-bold text-gray-800">處理結果：</span>
                          follow {webhookTestResult.result.followEvents} 筆，
                          新增待綁定 {webhookTestResult.result.pendingUsersAdded} 筆
                        </div>
                        <div>
                          <span className="font-bold text-gray-800">正式 Webhook URL：</span>
                          <span className="font-mono break-all">{webhookTestResult.webhookEndpoint}</span>
                        </div>
                        <div className={webhookTestResult.signatureConfigured ? 'text-green-700' : 'text-yellow-700'}>
                          {webhookTestResult.signatureConfigured
                            ? 'LINE_CHANNEL_SECRET 已設定，可驗證正式簽名。'
                            : 'LINE_CHANNEL_SECRET 尚未設定；本機驗證可跑，正式 Line Console 驗證前需補上。'}
                        </div>
                      </div>
                    )}
                  </div>

                  {reportLinkTestResult && (
                    <div className="border border-blue-100 bg-blue-50 rounded-lg p-3 text-xs text-blue-800 space-y-2">
                      <div className="font-bold">平安回報連結已產生：{reportLinkTestResult.seniorName}</div>
                      <a
                        href={reportLinkTestResult.reportUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-700 underline break-all"
                      >
                        開啟回報連結 <ExternalLink size={13} />
                      </a>
                      <div className="font-mono break-all text-blue-600">{reportLinkTestResult.reportUrl}</div>
                    </div>
                  )}

                  {(seniors as SeniorRow[]).map(senior => (
                    <div key={`test-${senior.id}`} className="border border-gray-100 rounded-lg p-3">
                      <div className="font-medium text-sm text-gray-800 mb-2">{senior.name}</div>
                      <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-5 gap-2">
                        <button
                          onClick={() => devScenario.mutate({ seniorId: senior.id, scenario: 'sentOver24h' })}
                          disabled={devScenario.isPending}
                          className="text-xs px-2 py-2 rounded bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          發送超過 24h
                        </button>
                        <button
                          onClick={() => devScenario.mutate({ seniorId: senior.id, scenario: 'reportedOver24h' })}
                          disabled={devScenario.isPending}
                          className="text-xs px-2 py-2 rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
                        >
                          回報超過 24h
                        </button>
                        <button
                          onClick={() => devScenario.mutate({ seniorId: senior.id, scenario: 'normal' })}
                          disabled={devScenario.isPending}
                          className="text-xs px-2 py-2 rounded bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                        >
                          恢復正常
                        </button>
                        <button
                          onClick={() => devScenario.mutate({ seniorId: senior.id, scenario: 'clearLine' })}
                          disabled={devScenario.isPending}
                          className="text-xs px-2 py-2 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                        >
                          清除測試 Line
                        </button>
                        <button
                          onClick={() => createReportLink.mutate({ seniorId: senior.id, appBaseUrl: window.location.origin })}
                          disabled={createReportLink.isPending}
                          className="text-xs px-2 py-2 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                        >
                          產生回報連結
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 space-y-2">
                  <div className="font-bold">每日問候 dry-run</div>
                  <div>
                    會發送：
                    <span className="ml-1 text-green-700 font-medium">
                      {dailyGreetingPreview?.wouldSend.length
                        ? dailyGreetingPreview.wouldSend.map(item => item.name).join('、')
                        : '無'}
                    </span>
                  </div>
                  <div>
                    略過：
                    <span className="ml-1 text-gray-500">
                      {dailyGreetingPreview?.skipped.length
                        ? dailyGreetingPreview.skipped.map(item => `${item.name}（${item.reason}）`).join('、')
                        : '無'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Loading */}
            {isLoading && (
              <div className="text-center py-12 text-gray-400">
                <Loader className="animate-spin mx-auto mb-2" size={32} />
                <p>載入中...</p>
              </div>
            )}

            {/* Senior List */}
            {!isLoading && (seniors as SeniorRow[]).length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <Users size={48} className="mx-auto mb-2 opacity-30" />
                <p>尚無長者資料，請點擊下方按鈕新增</p>
              </div>
            )}

            <div className="space-y-4">
              {(seniors as SeniorRow[]).map(senior => {
                const overdue = isReportOverdue(senior, now);
                return (
                <div key={senior.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden ${overdue ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-100'}`}>

                  {/* Card Header */}
                  <div className="p-4 border-b border-gray-50 flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-lg font-bold text-gray-800">{senior.name}</h3>
                        <StatusBadge status={senior.status} overdue={overdue} />
                        {senior.lineUserId && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-600 text-xs font-medium border border-green-200">
                            <MessageSquare size={12} /> Line 已綁定
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-1">
                        <MapPin size={14} /> {senior.address}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setHistorySenior(senior)}
                        className="bg-green-50 text-green-700 p-2 rounded-full hover:bg-green-100 transition"
                        title="查看訊息紀錄"
                      >
                        <History size={18} />
                      </button>
                      <button
                        onClick={() => openEditSenior(senior)}
                        className="bg-gray-100 text-gray-600 p-2 rounded-full hover:bg-gray-200 transition"
                        title="修正長者資料"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => initiateSend(senior)}
                        className="bg-blue-50 text-blue-600 p-2 rounded-full hover:bg-blue-100 transition"
                        title={senior.lineUserId ? '發送 Line 問候' : '模擬發送（未綁定 Line）'}
                      >
                        <Send size={20} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`確定要刪除 ${senior.name} 的資料嗎？`)) deleteSenior.mutate({ id: senior.id }); }}
                        className="bg-red-50 text-red-400 p-2 rounded-full hover:bg-red-100 transition"
                        title="刪除"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 bg-gray-50 text-sm space-y-2">
                    {overdue && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={18} className="mt-0.5 flex-none" />
                          <div>
                            <p className="font-bold">已超過 24 小時未回報平安</p>
                            <p className="text-xs text-red-600">建議志工主動電話聯繫，或先發送緊急關懷訊息。</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => initiateEmergencyCare(senior)}
                            className="flex-1 bg-red-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-700 flex items-center justify-center gap-1"
                          >
                            <Send size={14} /> 發送緊急關懷
                          </button>
                          <a
                            href={`tel:${senior.phone}`}
                            className="flex-1 bg-white border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-50 flex items-center justify-center gap-1"
                          >
                            <Phone size={14} /> 立即電話聯繫
                          </a>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span className="text-gray-500 flex items-center gap-1"><Phone size={14} /> 電話</span>
                      <a href={`tel:${senior.phone}`} className="text-blue-600 font-medium hover:underline">{senior.phone}</a>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 flex items-center gap-1"><Activity size={14} /> 健康</span>
                      <span className="text-gray-700">{senior.health} {senior.healthNote && `(${senior.healthNote})`}</span>
                    </div>

                    {/* 時間資訊 */}
                    {senior.messageSentTime && (
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>最後發送</span>
                        <span>{formatTime(senior.messageSentTime)}</span>
                      </div>
                    )}
                    {senior.lastReportTime && (
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>最後回報</span>
                        <span>{formatTime(senior.lastReportTime)}</span>
                      </div>
                    )}

                    {/* Line 綁定狀態 */}
                    <div className="flex items-center justify-between pt-1">
                      {senior.lineUserId ? (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <MessageSquare size={12} />
                          <span>Line: {senior.lineDisplayName || senior.lineUserId}</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleBindLine(senior.id)}
                          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
                        >
                          <Link2 size={12} /> 綁定 Line 帳號
                        </button>
                      )}
                    </div>

                    {/* AI Care Advice Button */}
                    <div className="pt-2">
                      <button
                        onClick={() => handleGetAdvice(senior)}
                        className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded hover:bg-purple-100 transition mb-2"
                      >
                        <Stethoscope size={14} />
                        {loadingAdviceId === senior.id ? 'AI 分析中...' : (adviceMap[senior.id] ? '隱藏照護建議' : '✨ AI 照護重點提示')}
                      </button>

                      {adviceMap[senior.id] && (
                        <div className="bg-purple-50 border border-purple-100 p-3 rounded-lg text-gray-700 whitespace-pre-line text-xs leading-relaxed">
                          <strong className="text-purple-700 block mb-1">🤖 AI 建議志工注意：</strong>
                          {adviceMap[senior.id]}
                        </div>
                      )}
                    </div>

                    {/* Status Control */}
                    <div className="pt-2 flex gap-2 items-center">
                      <RefreshCw size={14} className="text-gray-400" />
                      <select
                        value={senior.status}
                        onChange={(e) => updateStatus.mutate({ id: senior.id, status: e.target.value as SeniorStatus })}
                        className="text-xs px-2 py-1 border border-gray-300 rounded flex-1"
                      >
                        <option value="green">✅ 平安 (綠燈)</option>
                        <option value="yellow">⚠️ 關注 (黃燈)</option>
                        <option value="red">🚨 緊急 (紅燈)</option>
                        <option value="gray">⏳ 待發送</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
              })}
            </div>

            {/* Add Senior Button */}
            <button
              onClick={() => setActiveTab('add')}
              className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 flex items-center justify-center gap-2"
            >
              <UserPlus size={20} /> 新增長者資料
            </button>
          </div>
        )}

        {/* Line QR Code View */}
        {activeTab === 'line' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-6 text-center border border-green-100">
              <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-4">
                <QrCode size={30} />
              </div>
              <h2 className="text-xl font-bold text-gray-800">長者加入 Line 官方帳號</h2>
              <p className="text-sm text-gray-500 mt-2">
                請長者掃描 QR Code 加入 {LINE_OFFICIAL_ACCOUNT_ID}。加入後，系統會在綁定視窗自動顯示待綁定名單。
              </p>
              <div className="mt-6 inline-block p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                <img
                  src={LINE_QR_CODE_URL}
                  alt={`Line 官方帳號 ${LINE_OFFICIAL_ACCOUNT_ID} 加好友 QR Code`}
                  className="w-64 h-64 object-contain"
                />
              </div>
              <div className="mt-4 text-sm">
                <div className="font-mono text-green-700 font-bold">{LINE_OFFICIAL_ACCOUNT_ID}</div>
                <a
                  href={LINE_ADD_FRIEND_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1 mt-3 text-blue-600 hover:underline"
                >
                  開啟 Line 加好友連結 <ExternalLink size={14} />
                </a>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
              <p className="font-bold mb-1">現場操作提醒</p>
              <p>長者加入好友後，回到「長者名單」點選該長者的「綁定 Line 帳號」，選擇待綁定用戶即可完成綁定。</p>
            </div>

            <button
              onClick={() => setActiveTab('dashboard')}
              className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700"
            >
              回到長者名單
            </button>
          </div>
        )}

        {/* Add Senior View */}
        {activeTab === 'add' && (
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <UserPlus size={24} /> 新增長者資料
            </h2>

            <form onSubmit={handleAddSenior} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="例：王爺爺" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">電話 *</label>
                <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="例：0912-345-678" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">地址 *</label>
                <input type="text" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="例：台北市信義區..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">健康狀況</label>
                <select value={newHealth} onChange={(e) => setNewHealth(e.target.value as HealthStatus)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="良好">良好</option>
                  <option value="慢性病">慢性病</option>
                  <option value="行動不便">行動不便</option>
                  <option value="需定期回診">需定期回診</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">健康備註</label>
                <textarea value={newHealthNote} onChange={(e) => setNewHealthNote(e.target.value)}
                  className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="例：高血壓，需定期量測" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setActiveTab('dashboard')}
                  className="flex-1 py-3 text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
                <button type="submit" disabled={createSenior.isPending}
                  className="flex-1 bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50">
                  {createSenior.isPending ? '新增中...' : '新增'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* Message History Modal */}
      {historySenior && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-green-700 p-4 text-white flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold flex items-center gap-2">
                  <History size={20} /> 訊息與回報紀錄
                </h3>
                <p className="text-xs mt-1 text-green-100">{historySenior.name} 最近 20 筆紀錄</p>
              </div>
              <button
                onClick={() => setHistorySenior(null)}
                className="text-green-100 hover:text-white text-sm px-2 py-1 rounded"
              >
                關閉
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 bg-gray-50">
              {historyLoading && (
                <div className="text-center py-8 text-gray-400">
                  <Loader className="animate-spin mx-auto mb-2" size={24} />
                  <p className="text-sm">載入紀錄中...</p>
                </div>
              )}

              {!historyLoading && (historyMessages as MessageRow[]).length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <MessageSquare size={36} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">尚無訊息或回報紀錄</p>
                </div>
              )}

              {!historyLoading && (historyMessages as MessageRow[]).map(message => {
                const outbound = message.direction === 'outbound';
                return (
                  <div
                    key={message.id}
                    className={`rounded-lg border p-3 ${outbound ? 'bg-blue-50 border-blue-100' : 'bg-green-50 border-green-100'}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className={`flex items-center gap-1 text-xs font-bold ${outbound ? 'text-blue-700' : 'text-green-700'}`}>
                        {outbound ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                        {outbound ? '發送給長者' : '長者回覆'}
                      </div>
                      <div className="text-[11px] text-gray-500">{formatFullTime(message.sentAt)}</div>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{message.messageText}</p>
                    {message.lineMessageId && (
                      <div className="mt-2 text-[11px] text-gray-400 font-mono break-all">
                        {message.lineMessageId}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Edit Senior Modal */}
      {showEditModal && editTargetId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-gray-800 p-4 text-white">
              <h3 className="font-bold flex items-center gap-2">
                <Pencil size={20} /> 修正長者資料
              </h3>
              <p className="text-xs mt-1 text-gray-300">更新後會立即反映在長者名單與本機資料檔。</p>
            </div>
            <form onSubmit={handleEditSenior} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">電話 *</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">地址 *</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">健康狀況</label>
                <select
                  value={editHealth}
                  onChange={(e) => setEditHealth(e.target.value as HealthStatus)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="良好">良好</option>
                  <option value="慢性病">慢性病</option>
                  <option value="行動不便">行動不便</option>
                  <option value="需定期回診">需定期回診</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">健康備註</label>
                <textarea
                  value={editHealthNote}
                  onChange={(e) => setEditHealthNote(e.target.value)}
                  className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                  placeholder="例：高血壓，需定期量測"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3 text-gray-500 hover:bg-gray-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={updateSenior.isPending}
                  className="flex-1 bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50"
                >
                  {updateSenior.isPending ? '儲存中...' : '儲存修正'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Message Compose Modal */}
      {showComposeModal && currentComposeId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="bg-blue-600 p-4 text-white">
              <h3 className="font-bold flex items-center gap-2">
                <MessageCircle size={20} /> 撰寫問候訊息
              </h3>
              {(() => {
                const s = (seniors as SeniorRow[]).find(x => x.id === currentComposeId);
                return s?.lineUserId ? (
                  <p className="text-xs mt-1 text-blue-200">將透過 Line 發送給 {s.lineDisplayName || s.name}</p>
                ) : (
                  <p className="text-xs mt-1 text-yellow-200">⚠️ 此長者未綁定 Line，將進行模擬展示</p>
                );
              })()}
            </div>
            <div className="p-6 space-y-4">
              <textarea value={composeText} onChange={(e) => setComposeText(e.target.value)}
                className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
              <button onClick={handleGenerateGreeting} disabled={isGeneratingMessage}
                className="w-full bg-purple-100 text-purple-700 py-2 rounded-lg text-sm font-bold hover:bg-purple-200 transition flex items-center justify-center gap-2">
                {isGeneratingMessage ? <Loader className="animate-spin" size={16} /> : <Sparkles size={16} />}
                {isGeneratingMessage ? 'AI 正在撰寫中...' : 'AI 生成溫暖貼心問候 (✨ Gemini Power)'}
              </button>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setShowComposeModal(false)}
                  className="flex-1 py-3 text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
                <button onClick={finalizeSend} disabled={sendLineMutation.isPending}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 shadow-lg disabled:opacity-50">
                  {sendLineMutation.isPending ? '發送中...' : '確認發送'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simulate Modal（未綁定 Line 時的模擬展示） */}
      {showSimulateModal && simulatingId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="bg-green-600 p-4 text-white">
              <h3 className="font-bold flex items-center gap-2">
                <MessageCircle size={20} /> 模擬：長者的 Line 畫面
              </h3>
              <p className="text-xs mt-1 text-green-200">（此長者尚未綁定 Line，以下為模擬展示）</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-100 p-3 rounded-lg text-sm text-gray-600 relative">
                <p className="whitespace-pre-line">{simulationMsg}</p>
              </div>
              <div className="border-t pt-4">
                <p className="text-xs text-gray-500 text-center mb-2">長者點擊連結後，將看到以下按鈕：</p>
                <button
                  onClick={() => reportSafe.mutate({ seniorId: simulatingId })}
                  className="w-full bg-green-500 text-white py-4 rounded-xl text-xl font-bold hover:bg-green-600 shadow-lg transform active:scale-95 transition flex items-center justify-center gap-2">
                  <CheckCircle /> 我很平安，請放心
                </button>
              </div>
              <div className="text-center">
                <button onClick={() => setShowSimulateModal(false)} className="text-gray-400 text-sm hover:text-gray-600">
                  關閉模擬視窗 (不回報)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Line Bind Modal */}
      {showBindModal && bindTargetId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-green-600 p-4 text-white">
              <h3 className="font-bold flex items-center gap-2">
                <Link2 size={20} /> 綁定 Line 帳號
              </h3>
              <p className="text-xs mt-1 text-green-200">長者需先加入官方帳號 @833zhchh 為好友</p>
            </div>
            <div className="p-6 space-y-4">

              {/* 待綁定用戶清單 */}
              {pendingLineUsers.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs font-bold text-blue-700 mb-2">📲 已加好友、尚未綁定的用戶：</p>
                  <div className="space-y-2">
                    {pendingLineUsers.map(u => (
                      <button
                        key={u.lineUserId}
                        onClick={() => { setBindLineUserId(u.lineUserId); setBindLineDisplayName(u.displayName); }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition ${
                          bindLineUserId === u.lineUserId
                            ? 'bg-green-100 border-green-400 text-green-800'
                            : 'bg-white border-gray-200 hover:bg-blue-50'
                        }`}
                      >
                        <div className="font-medium">{u.displayName}</div>
                        <div className="text-xs text-gray-400 font-mono">{u.lineUserId}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pendingLineUsers.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                  <p className="font-bold mb-1">⚠️ 尚無待綁定用戶</p>
                  <p>請長者先掃描 QR Code 加入官方帳號好友，加入後此處會自動出現其名稱。</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Line User ID *</label>
                <input type="text" value={bindLineUserId} onChange={(e) => setBindLineUserId(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm font-mono ${
                    bindLineUserId && !isValidLineUserId(bindLineUserId)
                      ? 'border-red-400 bg-red-50'
                      : 'border-gray-300'
                  }`}
                  placeholder="U 開頭，共 33 個字元" />
                {bindLineUserId && !isValidLineUserId(bindLineUserId) && (
                  <p className="text-xs text-red-500 mt-1">格式不正確。應為 U 開頭加 32 個英數字元，例：U98f608b465602c9ae38d061495aa9a00</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">顯示名稱（選填）</label>
                <input type="text" value={bindLineDisplayName} onChange={(e) => setBindLineDisplayName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm"
                  placeholder="例：王爺爺的 Line" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowBindModal(false)}
                  className="flex-1 py-3 text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
                <button onClick={confirmBindLine}
                  disabled={!bindLineUserId.trim() || !isValidLineUserId(bindLineUserId) || bindLine.isPending}
                  className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50">
                  {bindLine.isPending ? '綁定中...' : '確認綁定'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-2 md:hidden">
        <button onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center p-2 ${activeTab === 'dashboard' ? 'text-orange-600' : 'text-gray-400'}`}>
          <Users size={24} />
          <span className="text-xs">長者名單</span>
        </button>
        <button onClick={() => setActiveTab('add')}
          className={`flex flex-col items-center p-2 ${activeTab === 'add' ? 'text-orange-600' : 'text-gray-400'}`}>
          <UserPlus size={24} />
          <span className="text-xs">新增資料</span>
        </button>
        <button onClick={() => setActiveTab('line')}
          className={`flex flex-col items-center p-2 ${activeTab === 'line' ? 'text-orange-600' : 'text-gray-400'}`}>
          <QrCode size={24} />
          <span className="text-xs">Line QR</span>
        </button>
      </nav>
    </div>
  );
}
