export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item) => (
          <details key={item.q} className="faq-item">
            <summary>
              <h3>{item.q}</h3>
            </summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>

      <style jsx global>{`
        .faq-item {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 12px;
        }
        .faq-item summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 18px 24px;
          cursor: pointer;
          list-style: none;
        }
        .faq-item summary::-webkit-details-marker {
          display: none;
        }
        .faq-item summary h3 {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          line-height: 1.4;
        }
        .faq-item summary::after {
          content: '+';
          flex-shrink: 0;
          color: #64748b;
          font-size: 1.3rem;
          font-weight: 400;
          line-height: 1;
          transition: transform 0.2s ease;
        }
        .faq-item[open] summary::after {
          transform: rotate(45deg);
        }
        .faq-item > p {
          margin: 0;
          padding: 0 24px 20px;
          color: #94a3b8;
          font-size: 0.9rem;
          line-height: 1.65;
        }
      `}</style>
    </>
  );
}
