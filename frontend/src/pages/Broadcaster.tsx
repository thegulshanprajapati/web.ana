import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { Calendar as CalendarIcon, Clock, Send, Trash2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { CustomSelect } from '../components/CustomSelect';

interface ScheduledMsg {
  id: number;
  recipient: string;
  message: string;
  scheduledTime: string;
  status: string;
}

export default function Broadcaster() {
  const { activeSessionId } = useSessionStore();
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [scheduledItems, setScheduledItems] = useState<ScheduledMsg[]>([]);

  // Custom datetime picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedHour, setSelectedHour] = useState('12');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('PM');

  const [applyTimestamp, setApplyTimestamp] = useState('');

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  useEffect(() => {
    fetchScheduled();
  }, []);

  const fetchScheduled = async () => {
    try {
      const res = await fetch('/api/scheduler');
      const data = await res.json();
      if (data.success) {
        setScheduledItems(data.scheduler);
      }
    } catch (err) {}
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDay(null);
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDay(null);
  };

  const formatSelectedDateTime = () => {
    if (selectedDay === null) return 'Select Date & Time';
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDay).padStart(2, '0');

    let hour = parseInt(selectedHour);
    if (selectedPeriod === 'PM' && hour !== 12) hour += 12;
    if (selectedPeriod === 'AM' && hour === 12) hour = 0;
    const finalHour = String(hour).padStart(2, '0');
    const finalMinute = String(selectedMinute).padStart(2, '0');

    return `${year}-${month}-${day}T${finalHour}:${finalMinute}:00`;
  };

  const handleApplyDateTime = () => {
    if (selectedDay === null) return;
    const ts = formatSelectedDateTime();
    setApplyTimestamp(ts);
    setShowDatePicker(false);
  };

  const scheduleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !message.trim() || !applyTimestamp) return;

    try {
      const res = await fetch('/api/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          recipient: recipient.trim(),
          message: message.trim(),
          scheduledTime: applyTimestamp
        })
      });
      const data = await res.json();
      if (data.success) {
        setRecipient('');
        setMessage('');
        setApplyTimestamp('');
        fetchScheduled();
      }
    } catch (err) {}
  };

  const deleteMessage = async (id: number) => {
    try {
      const res = await fetch(`/api/scheduler/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchScheduled();
      }
    } catch (err) {}
  };

  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDayIndex = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Scheduler Form panel */}
        <div className="md:col-span-1 glass-panel p-6 rounded-2xl space-y-4 h-fit">
          <h2 className="text-lg font-bold text-wa-green flex items-center gap-2">
            <Clock className="w-5 h-5" /> Queue Broadcast
          </h2>
          <form onSubmit={scheduleBroadcast} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recipient (Phone or JID)</label>
              <input
                type="text"
                placeholder="e.g. +919988776655"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-wa-green"
              />
            </div>

            <div className="space-y-1 relative">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Scheduled Delivery Time</label>
              <button
                type="button"
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none flex justify-between items-center hover:bg-white/5"
              >
                <span>{applyTimestamp ? applyTimestamp.replace('T', ' ') : 'Select Date & Time'}</span>
                <CalendarIcon className="w-4 h-4 text-wa-green" />
              </button>

              {/* Custom Datepicker popup */}
              {showDatePicker && (
                <div className="absolute top-[70px] left-0 w-[310px] bg-bg-secondary border border-wa-green/30 p-4 rounded-xl shadow-2xl z-50 glass-panel">
                  {/* Month header */}
                  <div className="flex justify-between items-center mb-3">
                    <button type="button" onClick={prevMonth} className="text-xs text-wa-green hover:underline">Prev</button>
                    <span className="text-xs font-semibold text-slate-100">
                      {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                    </span>
                    <button type="button" onClick={nextMonth} className="text-xs text-wa-green hover:underline">Next</button>
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400 mb-2">
                    {daysOfWeek.map((d) => <div key={d}>{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1 mb-4 text-center">
                    {Array.from({ length: firstDayIndex }).map((_, idx) => (
                      <div key={`empty-${idx}`} />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, idx) => {
                      const day = idx + 1;
                      const isSelected = selectedDay === day;
                      return (
                        <button
                          key={`day-${day}`}
                          type="button"
                          onClick={() => setSelectedDay(day)}
                          className={`w-7 h-7 rounded-lg text-xs font-semibold flex items-center justify-center transition-all ${
                            isSelected ? 'bg-wa-green text-black' : 'text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>

                  {/* Time picker select rows */}
                  <div className="flex gap-2 mb-4">
                    <CustomSelect
                      value={selectedHour}
                      onChange={(val) => setSelectedHour(val)}
                      options={Array.from({ length: 12 }).map((_, i) => {
                        const hr = String(i + 1).padStart(2, '0');
                        return { value: hr, label: `${hr} Hr` };
                      })}
                      className="flex-1"
                    />
                    <CustomSelect
                      value={selectedMinute}
                      onChange={(val) => setSelectedMinute(val)}
                      options={Array.from({ length: 60 }).map((_, i) => {
                        const min = String(i).padStart(2, '0');
                        return { value: min, label: `${min} Min` };
                      })}
                      className="flex-1"
                    />
                    <CustomSelect
                      value={selectedPeriod}
                      onChange={(val) => setSelectedPeriod(val as 'AM' | 'PM')}
                      options={[
                        { value: 'AM', label: 'AM' },
                        { value: 'PM', label: 'PM' }
                      ]}
                      className="w-24"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDatePicker(false)}
                      className="flex-1 bg-white/5 py-1.5 rounded text-xs hover:bg-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyDateTime}
                      className="flex-1 bg-wa-green text-black font-semibold py-1.5 rounded text-xs hover:bg-wa-green-dark"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Broadcast Message</label>
              <textarea
                placeholder="Type your message text here..."
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full bg-bg-secondary border border-wa-green/20 rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-wa-green"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-wa-green hover:bg-wa-green-dark text-black font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" /> Send Message
            </button>
          </form>
        </div>

        {/* Scheduled List Table panel */}
        <div className="md:col-span-2 glass-panel p-6 rounded-2xl space-y-4">
          <h2 className="text-lg font-bold text-slate-200">Scheduled Queue</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-wa-green/10 text-slate-400">
                  <th className="py-3 px-4 font-semibold">Recipient</th>
                  <th className="py-3 px-4 font-semibold">Message</th>
                  <th className="py-3 px-4 font-semibold">Time</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {scheduledItems.map((item) => (
                  <tr key={item.id} className="hover:bg-white/5 transition-all">
                    <td className="py-3.5 px-4 font-medium text-slate-200">{item.recipient}</td>
                    <td className="py-3.5 px-4 text-slate-300 max-w-[200px] truncate">{item.message}</td>
                    <td className="py-3.5 px-4 text-xs text-slate-400">{new Date(item.scheduledTime).toLocaleString()}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-2xs font-bold uppercase border ${
                        item.status === 'Sent' ? 'bg-wa-green/10 text-wa-green border-wa-green/20' :
                        item.status === 'Pending' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                        'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => deleteMessage(item.id)}
                        className="text-red-500 hover:text-red-400 transition-all p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {scheduledItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No broadcasts scheduled.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
