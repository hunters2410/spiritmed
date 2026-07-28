import { useState } from 'react';
import { 
  Bell, Search, Check, Trash2, 
  ExternalLink, Info, CheckCircle, AlertTriangle, 
  XCircle, Calendar, Inbox
} from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getRelativeDateLabel(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function Notifications() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredNotifications = notifications.filter(n => {
    const matchesFilter = filter === 'all' || (filter === 'unread' ? !n.is_read : n.is_read);
    const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         n.message.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Group by date
  const groups: Record<string, typeof notifications> = {};
  filteredNotifications.forEach(n => {
    const label = getRelativeDateLabel(n.created_at);
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  });

  const getIcon = (type: string = 'info') => {
    switch (type) {
      case 'success': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'error': return <XCircle className="w-5 h-5 text-rose-500" />;
      default: return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="w-8 h-8 text-blue-600" /> Notifications
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your alerts and system updates</p>
        </div>

        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition shadow-sm"
            >
              <Check className="w-4 h-4 text-emerald-600" /> Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-900/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-1 gap-1 shadow-sm w-fit">
            {(['all', 'unread', 'read'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-md transition ${filter === f ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
            />
          </div>
        </div>

        <div className="min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
              <p className="mt-4 text-gray-500 animate-pulse">Syncing alerts...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center px-4">
              <div className="w-20 h-20 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center mb-6">
                <Inbox className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Nothing to show</h3>
              <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-xs mx-auto">
                {searchQuery ? `We couldn't find any results for "${searchQuery}"` : "You're all caught up! No notifications found in this category."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {Object.entries(groups).map(([dateLabel, items]) => (
                <div key={dateLabel}>
                  <div className="px-6 py-3 bg-gray-50/50 dark:bg-gray-900/30">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" /> {dateLabel}
                    </h4>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-700">
                    {items.map((n) => (
                      <div
                        key={n.id}
                        className={`group px-6 py-6 transition-all hover:bg-gray-50 dark:hover:bg-gray-700/50 relative ${!n.is_read ? 'bg-blue-50/20 dark:bg-blue-900/5 border-l-4 border-blue-500' : 'border-l-4 border-transparent'}`}
                      >
                        <div className="flex gap-4">
                          <div className="mt-1 flex-shrink-0">
                            {getIcon(n.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h3 className={`text-sm ${!n.is_read ? 'font-black' : 'font-bold'} text-gray-900 dark:text-white`}>
                                  {n.title}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-semibold">
                                  {formatDateTime(n.created_at)}
                                </p>
                              </div>
                              <div className="flex flex-shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {!n.is_read && (
                                  <button
                                    onClick={() => markAsRead(n.id)}
                                    className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition shadow-sm"
                                    title="Mark as read"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                )}
                                <button 
                                  onClick={() => deleteNotification(n.id)}
                                  className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition shadow-sm"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed font-medium">
                              {n.message}
                            </div>
                            {n.link && (
                              <a
                                href={n.link}
                                onClick={() => markAsRead(n.id)}
                                className="inline-flex items-center gap-2 mt-4 text-xs font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest group/link"
                              >
                                View Details <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
