import NavItem from './nav-item/NavItem';
import styles from './Navigation.module.css';

export default function Navigation() {
    const navItems = [
        { name: 'Home', path: '/' },
        { name: 'All Comics', path: '/all-comics' },
        { name: 'Login', path: '#login' },
        { name: 'Register', path: '#register' },
        { name: 'Contacts', path: '#contacts' },
        { name: 'About', path: '#about' },
    ];

    return (
        <nav className={styles.nav}>
            <ul className={styles.list}>
                {navItems.map(item => <NavItem
                    key={item.name}
                    item={item}
                    style={({ isActive }) => isActive ? { color: '#c362ff' } : {}}
                />)}
            </ul>
        </nav>
    );
}