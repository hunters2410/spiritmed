import { supabase, Notification } from '../lib/supabase';

export const notificationService = {
  async send({
    userId,
    title,
    message,
    type = 'info',
    link = null,
    branchId = null
  }: {
    userId: string;
    title: string;
    message: string;
    type?: Notification['type'];
    link?: string | null;
    branchId?: string | null;
  }) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert([{
          user_id: userId,
          title,
          message,
          type,
          link,
          branch_id: branchId,
          is_read: false
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error sending notification:', error);
      return null;
    }
  },

  async notifyAdmins(branchId: string, title: string, message: string, type: Notification['type'] = 'info', link?: string) {
    try {
      // Fetch admins for the branch
      const { data: admins, error } = await supabase
        .from('users')
        .select('id')
        .eq('branch_id', branchId)
        .in('role', ['admin', 'super_admin']);

      if (error) throw error;

      if (admins) {
        const notifications = admins.map(admin => ({
          user_id: admin.id,
          branch_id: branchId,
          title,
          message,
          type,
          link,
          is_read: false
        }));

        const { error: insertError } = await supabase
          .from('notifications')
          .insert(notifications);

        if (insertError) throw insertError;
      }
    } catch (error) {
      console.error('Error notifying admins:', error);
    }
  }
};
