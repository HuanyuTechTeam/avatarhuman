interface TopBarProps {
    title?: string;
    subtitle?: string;
    dateText: string;
    timeText: string;
}

export function TopBar({title, subtitle, dateText, timeText}: TopBarProps) {
    const hasBrand = Boolean(title || subtitle);

    return (
        <header className={`top-bar${hasBrand ? "" : " top-bar--clock-only"}`}>
            {hasBrand ? (
                <div>
                    {title ? <div className="top-bar__brand">{title}</div> : null}
                    {subtitle ? <div className="top-bar__subtitle">{subtitle}</div> : null}
                </div>
            ) : null}
            <div className="top-bar__clock">
                <div>{dateText}</div>
                <div className="top-bar__time">{timeText}</div>
            </div>
        </header>
    );
}
