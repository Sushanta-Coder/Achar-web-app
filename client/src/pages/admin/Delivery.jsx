import { useEffect, useState } from 'react';
import Icon from '../../components/ui/Icon';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { PageLoader } from '../../components/ui/Spinner';
import { Modal, PageHeader, Panel } from '../../components/admin/AdminPage';
import { useFetch, useMutation } from '../../hooks/useApi';
import { del, patch, post } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import { formatPrice } from '../../lib/format';

/**
 * Delivery zones — what it costs to send a jar somewhere, and how long it takes.
 *
 * Three things here are deliberate:
 *
 *  - **Exactly one fallback zone.** `isDefault` is what quotes a charge for a district no zone
 *    names. The server enforces the "only one" rule and refuses to clear the last one, so this
 *    form can offer the checkbox freely and let the API be the authority.
 *
 *  - **Coverage gaps are shown, not hidden.** Every Nepali district is deliverable through the
 *    fallback, but a district falling through to it is usually an oversight rather than a
 *    decision, so `uncovered` gets a panel.
 *
 *  - **Districts are typed, not picked from 77 checkboxes.** The server normalises them:
 *    unknown names are rejected, and a district whose whole province is already covered is
 *    dropped as redundant. Listing Kathmandu under a zone that covers all of Bagmati is noise.
 */

const BLANK = {
  name: '',
  nameNp: '',
  description: '',
  provinces: [],
  districts: '',
  charge: 100,
  freeDeliveryThreshold: 0,
  estimatedDays: { min: 2, max: 5 },
  codAvailable: true,
  codExtraCharge: 0,
  priority: 0,
  isActive: true,
  isDefault: false,
};

export default function AdminDelivery() {
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const toast = useToast();

  useSeo({ title: 'Delivery · Admin', noIndex: true });

  const { data, loading, error, refetch } = useFetch('/delivery/admin/zones');

  const zones = data?.zones ?? [];
  const provinces = data?.provinces ?? [];
  const uncovered = data?.uncovered ?? {};
  const gapProvinces = Object.keys(uncovered);

  const remove = useMutation((id) => del(`/delivery/admin/zones/${id}`), {
    onSuccess: (result) => {
      toast.success(
        result?.deactivated
          ? 'Zone switched off — orders already delivered through it keep their charge'
          : 'Zone deleted'
      );
      setPendingDelete(null);
      refetch();
    },
    onError: (normalised) => toast.error(normalised.message),
  });

  if (loading && !data) return <PageLoader label="Loading delivery zones" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Delivery"
        description="Charges and lead times by province and district. The checkout quotes from these, and so does the order."
        actions={
          <button type="button" onClick={() => setEditing(BLANK)} className="btn-primary btn-sm">
            <Icon name="plus" className="size-4" />
            New zone
          </button>
        }
      />

      {/*
        No fallback means an address outside every named zone cannot be quoted, which fails at
        checkout rather than here. Worth shouting about.
      */}
      {!data?.hasDefault ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-red-600" />
          <div className="text-sm">
            <p className="font-medium text-red-800">There is no fallback zone</p>
            <p className="mt-0.5 text-red-700">
              A customer in a district no zone lists cannot be given a delivery charge, so
              checkout will refuse the order. Mark one zone as the fallback.
            </p>
          </div>
        </div>
      ) : null}

      {zones.length ? (
        <div className="card mb-4 overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Zone</th>
                <th scope="col" className="hidden md:table-cell">
                  Covers
                </th>
                <th scope="col" className="text-right">
                  Charge
                </th>
                <th scope="col" className="hidden sm:table-cell">
                  Lead time
                </th>
                <th scope="col" className="hidden lg:table-cell">
                  COD
                </th>
                <th scope="col" className="sr-only">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => (
                <tr key={zone._id}>
                  <td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{zone.name}</span>
                      {zone.isDefault ? (
                        <span className="badge border-brand-200 bg-brand-50 text-brand-800 border">
                          Fallback
                        </span>
                      ) : null}
                      {!zone.isActive ? (
                        <span className="badge border-cream-400 bg-cream-200 text-ink-600 border">
                          Off
                        </span>
                      ) : null}
                    </div>
                    {zone.freeDeliveryThreshold > 0 ? (
                      <p className="text-leaf-700 mt-0.5 text-xs">
                        Free over {formatPrice(zone.freeDeliveryThreshold)}
                      </p>
                    ) : null}
                  </td>

                  <td className="text-ink-500 hidden max-w-72 text-xs md:table-cell">
                    {zone.provinces?.length ? (
                      <p className="truncate">{zone.provinces.join(', ')}</p>
                    ) : null}
                    {zone.districts?.length ? (
                      <p className="truncate">
                        {zone.districts.length} district
                        {zone.districts.length === 1 ? '' : 's'}: {zone.districts.join(', ')}
                      </p>
                    ) : null}
                    {!zone.provinces?.length && !zone.districts?.length ? (
                      <span>Everywhere else</span>
                    ) : null}
                  </td>

                  <td className="tnum text-right text-sm font-semibold whitespace-nowrap">
                    {zone.charge === 0 ? 'Free' : formatPrice(zone.charge)}
                  </td>

                  <td className="text-ink-500 hidden text-xs whitespace-nowrap sm:table-cell">
                    {zone.estimatedDays?.min}–{zone.estimatedDays?.max} days
                  </td>

                  <td className="hidden text-xs lg:table-cell">
                    {zone.codAvailable ? (
                      <span className="text-leaf-700">
                        Yes
                        {zone.codExtraCharge > 0 ? ` · +${formatPrice(zone.codExtraCharge)}` : ''}
                      </span>
                    ) : (
                      <span className="text-ink-400">No</span>
                    )}
                  </td>

                  <td>
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            ...BLANK,
                            ...zone,
                            nameNp: zone.nameNp ?? '',
                            description: zone.description ?? '',
                            provinces: zone.provinces ?? [],
                            districts: (zone.districts ?? []).join(', '),
                            estimatedDays: {
                              min: zone.estimatedDays?.min ?? 2,
                              max: zone.estimatedDays?.max ?? 5,
                            },
                          })
                        }
                        className="btn-ghost btn-sm size-8 px-0"
                        title="Edit"
                      >
                        <Icon name="edit" className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(zone)}
                        className="btn-ghost btn-sm size-8 px-0 text-red-600"
                        title="Delete"
                      >
                        <Icon name="trash" className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card mb-4">
          <EmptyState
            icon="truck"
            title="No delivery zones"
            description="Start with a fallback zone covering the whole country, then add cheaper zones for the valley."
            action="Add a zone"
            onAction={() => setEditing({ ...BLANK, isDefault: true, name: 'Rest of Nepal' })}
          />
        </div>
      )}

      {gapProvinces.length ? (
        <Panel
          title="Districts no zone names"
          actions={<span className="text-ink-400 text-xs">Served by the fallback zone</span>}
        >
          <div className="space-y-2">
            {gapProvinces.map((province) => (
              <div key={province}>
                <p className="text-sm font-medium">{province}</p>
                <p className="text-ink-500 text-xs">{uncovered[province].join(', ')}</p>
              </div>
            ))}
          </div>
        </Panel>
      ) : (
        <Panel title="Coverage">
          <p className="text-leaf-700 text-sm">
            Every district is named by an active zone. Nothing is relying on the fallback.
          </p>
        </Panel>
      )}

      <ZoneModal
        value={editing}
        provinces={provinces}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refetch();
        }}
      />

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete this zone?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="btn-outline btn-sm"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={() => remove.run(pendingDelete._id)}
              disabled={remove.pending}
              className="btn btn-sm bg-red-600 text-white hover:bg-red-700"
            >
              {remove.pending ? <Spinner className="size-4" /> : null}
              Delete
            </button>
          </>
        }
      >
        <p className="text-ink-600 text-sm">
          <strong className="text-ink-900">{pendingDelete?.name}</strong> will stop quoting
          charges. If orders were delivered through it, it is switched off instead of deleted so
          their history stays readable.
        </p>
      </Modal>
    </>
  );
}

function ZoneModal({ value, provinces, onClose, onSaved }) {
  const isEdit = Boolean(value?._id);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (value) setForm(value);
  }, [value]);

  const field = (patchValues) => setForm((current) => ({ ...current, ...patchValues }));

  const toggleProvince = (province) =>
    field({
      provinces: form.provinces.includes(province)
        ? form.provinces.filter((entry) => entry !== province)
        : [...form.provinces, province],
    });

  const submit = async (event) => {
    event.preventDefault();

    const districts = String(form.districts ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    // The server refines the same rule; checking here saves a round trip and says it in
    // plainer language than a field error would.
    if (!form.provinces.length && !districts.length && !form.isDefault) {
      toast.error('Pick at least one province or district, or make this the fallback zone.');
      return;
    }

    const body = {
      name: form.name,
      nameNp: form.nameNp || undefined,
      description: form.description || undefined,
      provinces: form.provinces,
      districts,
      charge: Number(form.charge) || 0,
      freeDeliveryThreshold: Number(form.freeDeliveryThreshold) || 0,
      estimatedDays: {
        min: Number(form.estimatedDays.min) || 1,
        max: Number(form.estimatedDays.max) || 1,
      },
      codAvailable: Boolean(form.codAvailable),
      codExtraCharge: Number(form.codExtraCharge) || 0,
      priority: Number(form.priority) || 0,
      isActive: Boolean(form.isActive),
      isDefault: Boolean(form.isDefault),
    };

    setBusy(true);
    try {
      if (isEdit) await patch(`/delivery/admin/zones/${value._id}`, body);
      else await post('/delivery/admin/zones', body);
      toast.success(isEdit ? 'Zone saved' : `Zone "${body.name}" created`);
      onSaved();
    } catch (error) {
      toast.error(error?.normalised?.message ?? 'Could not save the zone');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={isEdit ? `Edit ${value?.name}` : 'New delivery zone'}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-outline btn-sm">
            Cancel
          </button>
          <button type="submit" form="zone-form" disabled={busy} className="btn-primary btn-sm">
            {busy ? <Spinner className="size-4" /> : null}
            {isEdit ? 'Save changes' : 'Create zone'}
          </button>
        </>
      }
    >
      <form id="zone-form" onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="zone-name" className="field-label">
              Zone name
            </label>
            <input
              id="zone-name"
              required
              maxLength={80}
              value={form.name}
              onChange={(event) => field({ name: event.target.value })}
              className="field-input"
              placeholder="Kathmandu Valley"
            />
          </div>

          <div>
            <label htmlFor="zone-nameNp" className="field-label">
              Name in Nepali <span className="text-ink-400 font-normal">(optional)</span>
            </label>
            <input
              id="zone-nameNp"
              maxLength={80}
              value={form.nameNp}
              onChange={(event) => field({ nameNp: event.target.value })}
              className="field-input"
              lang="ne"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="zone-charge" className="field-label">
              Delivery charge
            </label>
            <input
              id="zone-charge"
              type="number"
              min={0}
              step={1}
              value={form.charge}
              onChange={(event) => field({ charge: event.target.value })}
              className="field-input tnum"
            />
            <p className="field-hint">0 means free.</p>
          </div>

          <div>
            <label htmlFor="zone-free" className="field-label">
              Free over
            </label>
            <input
              id="zone-free"
              type="number"
              min={0}
              step={1}
              value={form.freeDeliveryThreshold}
              onChange={(event) => field({ freeDeliveryThreshold: event.target.value })}
              className="field-input tnum"
            />
            <p className="field-hint">0 disables it.</p>
          </div>

          <div>
            <label htmlFor="zone-priority" className="field-label">
              Priority
            </label>
            <input
              id="zone-priority"
              type="number"
              min={0}
              max={999}
              step={1}
              value={form.priority}
              onChange={(event) => field({ priority: event.target.value })}
              className="field-input tnum"
            />
            <p className="field-hint">Higher wins when two zones match.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="zone-days-min" className="field-label">
              Fastest (days)
            </label>
            <input
              id="zone-days-min"
              type="number"
              min={1}
              max={30}
              step={1}
              value={form.estimatedDays.min}
              onChange={(event) =>
                field({ estimatedDays: { ...form.estimatedDays, min: event.target.value } })
              }
              className="field-input tnum"
            />
          </div>

          <div>
            <label htmlFor="zone-days-max" className="field-label">
              Slowest (days)
            </label>
            <input
              id="zone-days-max"
              type="number"
              min={1}
              max={30}
              step={1}
              value={form.estimatedDays.max}
              onChange={(event) =>
                field({ estimatedDays: { ...form.estimatedDays, max: event.target.value } })
              }
              className="field-input tnum"
            />
            <p className="field-hint">Shown to the customer as a range.</p>
          </div>
        </div>

        <fieldset>
          <legend className="field-label">Provinces covered</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {provinces.map((province) => (
              <label
                key={province}
                className="border-cream-300 flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={form.provinces.includes(province)}
                  onChange={() => toggleProvince(province)}
                  className="size-4 cursor-pointer"
                />
                {province}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="zone-districts" className="field-label">
            Individual districts
          </label>
          <input
            id="zone-districts"
            value={form.districts}
            onChange={(event) => field({ districts: event.target.value })}
            className="field-input"
            placeholder="Kathmandu, Lalitpur, Bhaktapur"
          />
          <p className="field-hint">
            Comma separated. A district whose province is already ticked above is dropped as
            redundant, and an unrecognised name is rejected.
          </p>
        </div>

        <div>
          <label htmlFor="zone-description" className="field-label">
            Note <span className="text-ink-400 font-normal">(optional)</span>
          </label>
          <input
            id="zone-description"
            maxLength={600}
            value={form.description}
            onChange={(event) => field({ description: event.target.value })}
            className="field-input"
            placeholder="Same-day inside Ring Road if ordered before 11am"
          />
        </div>

        <div className="border-cream-300 space-y-2 rounded-xl border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.codAvailable}
              onChange={(event) => field({ codAvailable: event.target.checked })}
              className="size-4 cursor-pointer"
            />
            Cash on delivery available here
          </label>

          {form.codAvailable ? (
            <div>
              <label htmlFor="zone-cod-extra" className="field-label">
                Extra charge for COD
              </label>
              <input
                id="zone-cod-extra"
                type="number"
                min={0}
                step={1}
                value={form.codExtraCharge}
                onChange={(event) => field({ codExtraCharge: event.target.value })}
                className="field-input tnum"
              />
            </div>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => field({ isActive: event.target.checked })}
              className="size-4 cursor-pointer"
            />
            Switched on
          </label>

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) => field({ isDefault: event.target.checked })}
              className="mt-0.5 size-4 cursor-pointer"
            />
            <span>
              Use as the fallback zone
              <span className="text-ink-500 block text-xs">
                Quotes for any district no other zone names. Only one zone can be the fallback —
                ticking this clears it elsewhere.
              </span>
            </span>
          </label>
        </div>
      </form>
    </Modal>
  );
}
