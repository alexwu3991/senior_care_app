import { useState } from "react";
import { useLocation } from "wouter";
import { Activity, KeyRound, Loader, HelpCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function Login() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [showRecoveryHelp, setShowRecoveryHelp] = useState(false);

  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("登入成功");
      navigate("/");
    },
    onError: error => toast.error(error.message || "登入失敗"),
  });

  const registerManager = trpc.auth.registerManager.useMutation({
    onSuccess: () => {
      toast.success("註冊成功，請使用新帳號登入");
      setUsername(registerUsername);
      setPassword("");
      setRegisterName("");
      setRegisterUsername("");
      setRegisterPassword("");
      setRegisterEmail("");
      setMode("login");
    },
    onError: error => toast.error(error.message || "註冊失敗"),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    login.mutate({
      username,
      password,
    });
  };

  const handleRegister = (event: React.FormEvent) => {
    event.preventDefault();
    registerManager.mutate({
      name: registerName,
      username: registerUsername,
      password: registerPassword,
      email: registerEmail,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-orange-600 text-white p-5">
          <div className="flex items-center gap-2">
            <Activity />
            <h1 className="text-xl font-bold">{mode === "login" ? "管理者登入" : "管理者註冊"}</h1>
          </div>
          <p className="text-sm text-orange-100 mt-2">
            {mode === "login" ? "登入後只管理自己關懷的長者。" : "新管理者需先註冊帳號，再登入使用。"}
          </p>
        </div>

        <div className="px-6 pt-6">
          <div className="grid grid-cols-2 gap-2 bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`py-2 rounded-md text-sm font-bold ${mode === "login" ? "bg-white text-orange-700 shadow-sm" : "text-gray-500"}`}
            >
              登入
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`py-2 rounded-md text-sm font-bold ${mode === "register" ? "bg-white text-orange-700 shadow-sm" : "text-gray-500"}`}
            >
              註冊
            </button>
          </div>
        </div>

        {mode === "login" && (
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">帳號</label>
            <input
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="username"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              placeholder="例：admin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              placeholder="請輸入密碼"
            />
          </div>

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {login.isPending ? <Loader className="animate-spin" size={18} /> : <KeyRound size={18} />}
            登入
          </button>

          <button
            type="button"
            onClick={() => setShowRecoveryHelp(value => !value)}
            className="w-full text-sm text-orange-700 hover:text-orange-800 font-bold flex items-center justify-center gap-1"
          >
            <HelpCircle size={16} /> 忘記帳號或密碼？
          </button>

          {showRecoveryHelp && (
            <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 text-sm text-orange-900 space-y-2">
              <div className="font-bold flex items-center gap-1">
                <ShieldCheck size={16} /> 帳號/密碼取回方式
              </div>
              <p>帳號可請系統管理員在「管理者帳號」清單查詢。</p>
              <p>密碼為安全雜湊儲存，無法顯示舊密碼；請由系統管理員重設新密碼後再登入。</p>
            </div>
          )}
        </form>
        )}

        {mode === "register" && (
        <form onSubmit={handleRegister} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
            <input
              value={registerName}
              onChange={event => setRegisterName(event.target.value)}
              autoComplete="name"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              placeholder="例：王志工"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">帳號</label>
            <input
              value={registerUsername}
              onChange={event => setRegisterUsername(event.target.value)}
              autoComplete="username"
              required
              minLength={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              placeholder="至少 3 個字"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
            <input
              type="password"
              value={registerPassword}
              onChange={event => setRegisterPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              placeholder="至少 8 個字"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email（選填）</label>
            <input
              type="email"
              value={registerEmail}
              onChange={event => setRegisterEmail(event.target.value)}
              autoComplete="email"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              placeholder="name@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={registerManager.isPending}
            className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {registerManager.isPending ? <Loader className="animate-spin" size={18} /> : <KeyRound size={18} />}
            建立帳號
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
