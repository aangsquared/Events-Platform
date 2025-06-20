import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';

export async function GET() {
    try {
        // Check if user is authenticated and is staff
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (session.user.role !== 'staff') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        // First, get all events created by the staff member
        const eventsRef = collection(db, 'events');
        const eventsQuery = query(eventsRef, where('createdBy', '==', session.user.id));
        const eventsSnapshot = await getDocs(eventsQuery);

        // Create a map of event IDs for quick lookup
        const staffEventIds = new Set(eventsSnapshot.docs.map(doc => doc.id));
        const eventDataMap = new Map(eventsSnapshot.docs.map(doc => [
            doc.id,
            {
                name: doc.data().name,
                startDate: doc.data().startDate
            }
        ]));

        // Get all registrations
        const registrationsRef = collection(db, 'registrations');
        const registrationsSnapshot = await getDocs(registrationsRef);

        const events = [];
        const eventRegistrations = new Map();

        // Filter and group registrations by event
        for (const regDoc of registrationsSnapshot.docs) {
            const regData = regDoc.data();

            // Only process registrations for events created by this staff member
            if (!staffEventIds.has(regData.eventId)) {
                continue;
            }

            const registration = {
                id: regDoc.id,
                eventId: regData.eventId,
                userEmail: regData.userEmail,
                userName: regData.userName,
                registeredAt: regData.registeredAt instanceof Timestamp ?
                    regData.registeredAt.toDate().toISOString() :
                    new Date(regData.registeredAt).toISOString(),
                status: regData.status,
                ticketCount: regData.ticketCount || 1
            };

            if (!eventRegistrations.has(regData.eventId)) {
                eventRegistrations.set(regData.eventId, []);
            }
            eventRegistrations.get(regData.eventId).push(registration);
        }

        // Create the final events array with their registrations
        for (const [eventId, registrations] of eventRegistrations) {
            const eventData = eventDataMap.get(eventId);
            if (!eventData) {
                continue;
            }

            let startDate;
            if (eventData.startDate instanceof Timestamp) {
                startDate = eventData.startDate.toDate().toISOString();
            } else if (typeof eventData.startDate === 'string') {
                startDate = new Date(eventData.startDate).toISOString();
            } else {
                startDate = new Date().toISOString();
            }

            events.push({
                id: eventId,
                name: eventData.name,
                startDate,
                registrations
            });
        }

        return NextResponse.json({ events });
    } catch (error) {
        console.error('Error fetching registrations:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
} 