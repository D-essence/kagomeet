import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { AboutPage, EventDetail, EventsPage, FAQPage, Home, LegalPage, NotFound } from './pages';
import { ApplyPage, CompletePage, ContactPage } from './forms';
const Admin = lazy(() => import('./Admin'));
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <div className="empty-state">
          <h1>画面を読み込めませんでした。</h1>
          <button className="button dark" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </div>
      );
    return this.props.children;
  }
}
export default function App() {
  const location = useLocation();
  useEffect(() => {
    const names: Record<string, string> = {
      '/': '鹿児島の飲み会・交流イベント',
      '/events': 'イベント一覧',
      '/about': '初めての方へ',
      '/faq': 'よくある質問',
      '/contact': 'お問い合わせ',
      '/terms': '利用規約',
      '/privacy': 'プライバシーポリシー',
      '/legal': '特定商取引法に基づく表記',
      '/admin': '運営者管理',
      '/complete': 'お申し込みの確認',
    };
    document.title = `${names[location.pathname] || 'イベント・参加申し込み'} | KAGOMEET`;
  }, [location.pathname]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08 },
    );
    document.querySelectorAll('.reveal').forEach((e) => {
      e.classList.add('reveal-ready');
      observer.observe(e);
    });
    return () => observer.disconnect();
  }, [location.pathname]);
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="loading">読み込み中…</div>}>
        <Routes>
          <Route path="/admin/*" element={<Admin />} />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/:id" element={<EventDetail />} />
            <Route path="events/:id/apply" element={<ApplyPage />} />
            <Route path="complete" element={<CompletePage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="faq" element={<FAQPage />} />
            <Route path="contact" element={<ContactPage />} />
            <Route path="terms" element={<LegalPage kind="terms" />} />
            <Route path="privacy" element={<LegalPage kind="privacy" />} />
            <Route path="legal" element={<LegalPage kind="legal" />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
