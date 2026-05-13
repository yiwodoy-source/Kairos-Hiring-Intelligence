export function buildAckMessage(name: string, role: string): string {
  return `Hi ${name}! Thank you for applying for the *${role}* position at our company. We've received your application and our team will review it shortly. You'll hear back from us within 2–3 business days. 🙏`;
}

export function buildShortlistMessage(name: string, role: string): string {
  return `Hi ${name}! 🎉 Great news — you've been *shortlisted* for the *${role}* position. Our recruitment team will reach out soon to schedule an interview. Stay tuned!`;
}

export function buildRejectMessage(name: string, role: string): string {
  return `Hi ${name}, thank you for your interest in the *${role}* position. After careful review, we've decided to move forward with other candidates at this time. We appreciate your time and will keep your profile for future opportunities. Best wishes! 🙏`;
}

export function buildInterviewMessage(
  name: string,
  role: string,
  dateTime: string,
  meetLink: string
): string {
  return (
    `Hi ${name}! Your interview for the *${role}* position is confirmed. 📅\n\n` +
    `🗓 *Date & Time:* ${dateTime}\n` +
    `🔗 *Meet Link:* ${meetLink}\n\n` +
    `Please join 5 minutes early. Looking forward to speaking with you!`
  );
}

export function buildReviewMessage(name: string, role: string): string {
  return `Hi ${name}, we've received your application for the *${role}* role and it's currently under review by our team. We'll keep you posted on the next steps. Thank you for your patience! 🙏`;
}

export function buildFromStatus(
  status: string,
  name: string,
  role: string,
  extra?: { dateTime?: string; meetLink?: string }
): string {
  switch (status) {
    case 'Shortlisted':
      return buildShortlistMessage(name, role);
    case 'Rejected':
      return buildRejectMessage(name, role);
    case 'Interview':
      return buildInterviewMessage(
        name,
        role,
        extra?.dateTime || 'TBD — our team will confirm shortly',
        extra?.meetLink || ''
      );
    default:
      return buildAckMessage(name, role);
  }
}
